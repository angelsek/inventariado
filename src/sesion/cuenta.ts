import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { AJUSTE_DISPOSITIVO, AJUSTE_NEGOCIO, guardarAjuste, leerAjuste } from '@/db/ajustes';
import { registrarDispositivo } from '@/db/dispositivos';
import { borrarDatosLocales } from '@/db/negocio';
import { obtenerEstadoSuscripcion } from '@/db/suscripcion';
import type { BaseLocal } from '@/db/tipos';
import { hashPin } from '@/lib/pin';
import { supabase } from '@/lib/supabase';
import { sincronizar } from '@/sync/motor';
import { remotoSupabase } from '@/sync/remotoSupabase';

import { idTelefonoEstable } from './idTelefono';
import { useSesion } from './store';

export type DatosNegocio = {
  nombreNegocio: string;
  rut: string;
  direccion: string;
  nombreDueno: string;
  pin: string;
};

/** PC ya vinculado al negocio, que el PC nuevo puede reemplazar sin gastar otro cupo. */
export type EquipoVinculado = { id: string; nombre: string; ultimo_sync: string | null };

/**
 * Datos del equipo al vincularlo (solo en la versión web; el teléfono usa su modelo).
 * `elegirReemplazo` se llama si el negocio ya tiene PC vinculados y este navegador no tiene
 * id propio (p. ej. se borraron los datos del sitio): devuelve el id del PC que reemplaza,
 * o null para vincularlo como equipo nuevo.
 */
export type OpcionesEquipo = {
  nombre?: string;
  elegirReemplazo?: (equipos: EquipoVinculado[]) => Promise<string | null>;
};

/** Resultado de crear cuenta o iniciar sesión. */
export type Resultado =
  | { tipo: 'listo' }
  /** Supabase pide confirmar el correo antes de continuar. */
  | { tipo: 'confirmar_correo' }
  /** El correo ya tenía cuenta (ej. en otra app del mismo proyecto Supabase). */
  | { tipo: 'cuenta_existente' }
  /** La cuenta existe pero aún no tiene negocio (ej. se confirmó el correo después). */
  | { tipo: 'sin_negocio' };

/** Crea la cuenta del dueño y su negocio. */
export async function crearCuentaYNegocio(
  db: BaseLocal,
  correo: string,
  contrasena: string,
  datos: DatosNegocio,
  equipo?: OpcionesEquipo,
): Promise<Resultado> {
  const { data, error } = await supabase.auth.signUp({
    email: correo.trim(),
    password: contrasena,
  });
  if (error) throw error;
  // Si el correo ya existe, Supabase no da error (para no revelar qué correos
  // están registrados): devuelve un usuario sin identidades y sin sesión.
  if (data.user && data.user.identities?.length === 0) return { tipo: 'cuenta_existente' };
  if (!data.session) return { tipo: 'confirmar_correo' };

  await crearNegocio(db, datos, equipo);
  return { tipo: 'listo' };
}

/** Crea el negocio para la cuenta con sesión iniciada y vincula este teléfono. */
export async function crearNegocio(
  db: BaseLocal,
  datos: DatosNegocio,
  equipo?: OpcionesEquipo,
): Promise<void> {
  const perfilId = randomUUID();
  const { data: negocioId, error } = await supabase.rpc('crear_negocio', {
    p_nombre: datos.nombreNegocio,
    p_rut: datos.rut,
    p_direccion: datos.direccion,
    p_perfil_id: perfilId,
    p_nombre_dueno: datos.nombreDueno,
    p_pin_hash: await hashPin(perfilId, datos.pin),
  });
  if (error) throw new Error(error.message);

  await vincularTelefono(db, negocioId as string, equipo);
}

/** Inicia sesión y, si la cuenta tiene negocio, vincula este teléfono a él. */
export async function iniciarSesion(
  db: BaseLocal,
  correo: string,
  contrasena: string,
  equipo?: OpcionesEquipo,
): Promise<Resultado> {
  const { error } = await supabase.auth.signInWithPassword({
    email: correo.trim(),
    password: contrasena,
  });
  if (error) throw error;

  const { data, error: errorNegocio } = await supabase
    .from('negocio_usuarios')
    .select('negocio_id')
    .limit(1)
    .maybeSingle();
  if (errorNegocio) throw new Error(errorNegocio.message);
  if (!data) return { tipo: 'sin_negocio' };

  await vincularTelefono(db, data.negocio_id as string, equipo);
  return { tipo: 'listo' };
}

/** Cierra la sesión y borra los datos del negocio guardados en este teléfono. */
export async function cerrarSesion(db: BaseLocal): Promise<void> {
  // scope local: funciona sin internet.
  await supabase.auth.signOut({ scope: 'local' });
  await borrarDatosLocales(db);
  useSesion.getState().desvincular();
}

/**
 * Elimina el negocio y todos sus datos (servidor y teléfono). Pide la contraseña
 * de la cuenta para confirmar que es el dueño. Requiere internet.
 */
export async function eliminarNegocio(db: BaseLocal, contrasena: string): Promise<void> {
  const negocioId = useSesion.getState().negocioId;
  const { data } = await supabase.auth.getSession();
  const correo = data.session?.user.email;
  if (!negocioId || !correo)
    throw new Error('La sesión expiró. Cierra sesión y vuelve a ingresar.');

  const { error: errorAuth } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });
  if (errorAuth) throw errorAuth;

  const { error } = await supabase.rpc('eliminar_mi_negocio', { p_negocio_id: negocioId });
  if (error) throw new Error(error.message);

  await cerrarSesion(db);
  useSesion.getState().fijarAvisoSalida('Tu negocio y todos sus datos fueron eliminados.');
}

/** PC vinculados al negocio (para ofrecer reemplazarlos). Requiere sesión e internet. */
async function pcVinculados(negocioId: string): Promise<EquipoVinculado[]> {
  const { data, error } = await supabase.rpc('mis_dispositivos', { p_negocio_id: negocioId });
  if (error) throw new Error(error.message);
  const equipos = ((data as { dispositivos?: (EquipoVinculado & { tipo?: string })[] } | null)
    ?.dispositivos ?? []) as (EquipoVinculado & { tipo?: string })[];
  return equipos
    .filter((e) => e.tipo === 'pc')
    .map(({ id, nombre, ultimo_sync }) => ({ id, nombre, ultimo_sync }));
}

async function vincularTelefono(
  db: BaseLocal,
  negocioId: string,
  equipo?: OpcionesEquipo,
): Promise<void> {
  await borrarDatosLocales(db);
  const esPc = Platform.OS === 'web';

  // Si el equipo ya tenía id (instalaciones anteriores) se conserva, para no ocupar otro cupo.
  let dispositivoId = await leerAjuste(db, AJUSTE_DISPOSITIVO);
  if (!dispositivoId && esPc && equipo?.elegirReemplazo) {
    const pcs = await pcVinculados(negocioId);
    if (pcs.length) dispositivoId = await equipo.elegirReemplazo(pcs);
  }
  if (!dispositivoId) dispositivoId = await idTelefonoEstable();

  const nombre = (equipo?.nombre?.trim() || nombreDelTelefono()).slice(0, 60);
  // El servidor revisa el límite de equipos del plan (error LIMITE_DISPOSITIVOS). El teléfono
  // no envía p_tipo: así sigue funcionando con servidores sin la migración dispositivos_tipo.
  const registrar = (id: string) =>
    supabase.rpc('registrar_dispositivo', {
      p_id: id,
      p_negocio_id: negocioId,
      p_nombre: nombre,
      ...(esPc ? { p_tipo: 'pc' } : {}),
    });
  let { error } = await registrar(dispositivoId);
  // El id ya es de un equipo de otro negocio (p. ej. el teléfono se usó antes en otro
  // negocio): el servidor no deja tomarlo, así que este equipo se vincula con un id nuevo.
  if (error && /DISPOSITIVO_DE_OTRO_NEGOCIO/.test(error.message)) {
    dispositivoId = randomUUID();
    ({ error } = await registrar(dispositivoId));
  }
  if (error) throw new Error(error.message);
  await guardarAjuste(db, AJUSTE_DISPOSITIVO, dispositivoId);
  await registrarDispositivo(db, { id: dispositivoId, negocioId, nombre });

  // La primera sincronización trae el negocio y los perfiles: sin ella no se puede elegir usuario.
  await sincronizar(db, remotoSupabase, negocioId);
  await guardarAjuste(db, AJUSTE_NEGOCIO, negocioId);
  useSesion.getState().fijarSuscripcion(await obtenerEstadoSuscripcion(db, negocioId));
  useSesion.getState().fijarAvisoSalida(null);
  useSesion.getState().vincular(negocioId);
}

function nombreDelTelefono(): string {
  if (Platform.OS === 'web') return 'PC';
  const constantes = Platform.constants as { Brand?: string; Model?: string };
  const nombre = [constantes.Brand, constantes.Model].filter(Boolean).join(' ');
  return nombre || 'Teléfono';
}
