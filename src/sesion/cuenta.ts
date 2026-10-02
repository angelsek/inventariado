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

  await crearNegocio(db, datos);
  return { tipo: 'listo' };
}

/** Crea el negocio para la cuenta con sesión iniciada y vincula este teléfono. */
export async function crearNegocio(db: BaseLocal, datos: DatosNegocio): Promise<void> {
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

  await vincularTelefono(db, negocioId as string);
}

/** Inicia sesión y, si la cuenta tiene negocio, vincula este teléfono a él. */
export async function iniciarSesion(
  db: BaseLocal,
  correo: string,
  contrasena: string,
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

  await vincularTelefono(db, data.negocio_id as string);
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

async function vincularTelefono(db: BaseLocal, negocioId: string): Promise<void> {
  await borrarDatosLocales(db);

  // Si el teléfono ya tenía id (instalaciones anteriores) se conserva, para no ocupar otro cupo.
  let dispositivoId = await leerAjuste(db, AJUSTE_DISPOSITIVO);
  if (!dispositivoId) {
    dispositivoId = await idTelefonoEstable();
    await guardarAjuste(db, AJUSTE_DISPOSITIVO, dispositivoId);
  }
  const nombre = nombreDelTelefono();
  // El servidor revisa el límite de teléfonos del plan (error LIMITE_DISPOSITIVOS).
  const { error } = await supabase.rpc('registrar_dispositivo', {
    p_id: dispositivoId,
    p_negocio_id: negocioId,
    p_nombre: nombre,
  });
  if (error) throw new Error(error.message);
  await registrarDispositivo(db, { id: dispositivoId, negocioId, nombre });

  // La primera sincronización trae el negocio y los perfiles: sin ella no se puede elegir usuario.
  await sincronizar(db, remotoSupabase, negocioId);
  await guardarAjuste(db, AJUSTE_NEGOCIO, negocioId);
  useSesion.getState().fijarSuscripcion(await obtenerEstadoSuscripcion(db, negocioId));
  useSesion.getState().fijarAvisoSalida(null);
  useSesion.getState().vincular(negocioId);
}

function nombreDelTelefono(): string {
  const constantes = Platform.constants as { Brand?: string; Model?: string };
  const nombre = [constantes.Brand, constantes.Model].filter(Boolean).join(' ');
  return nombre || 'Teléfono';
}
