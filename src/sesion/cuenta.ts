import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import {
  AJUSTE_DISPOSITIVO,
  AJUSTE_LOCAL_ORIGEN,
  AJUSTE_NEGOCIO,
  AJUSTE_ULTIMO_LOCAL,
  guardarAjuste,
  leerAjuste,
} from '@/db/ajustes';
import { registrarDispositivo } from '@/db/dispositivos';
import { borrarDatosLocales, obtenerNegocio } from '@/db/negocio';
import { listarPerfiles, type Perfil } from '@/db/perfiles';
import { obtenerEstadoSuscripcion } from '@/db/suscripcion';
import type { BaseLocal } from '@/db/tipos';
import type { Permiso } from '@/features/permisos/catalogo';
import { PERMISO_MULTI_LOCAL } from '@/features/permisos/edicionPersonas';
import { permisosDePerfil } from '@/features/permisos/permisos';
import { URL_CONFIRMACION_CORREO } from '@/lib/enlaces';
import { hashPin } from '@/lib/pin';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { contarPendientes, sincronizar } from '@/sync/motor';
import { pausarSincronizacion, reanudarSincronizacion } from '@/sync/pausa';
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
    options: { emailRedirectTo: URL_CONFIRMACION_CORREO },
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
  const { negocioId, idParaVincular } = await crearNegocioEnServidor(db, datos);
  await vincularTelefono(db, negocioId, equipo, idParaVincular);
}

/** Crea el negocio en el servidor (sin tocar los datos de este equipo). */
async function crearNegocioEnServidor(
  db: BaseLocal,
  datos: DatosNegocio,
): Promise<{ negocioId: string; idParaVincular: string }> {
  const perfilId = randomUUID();
  // El id del equipo se calcula antes de crear el negocio: el servidor lo usa como una de las
  // llaves de la prueba gratis (una por negocio). En el teléfono es siempre el que sale del
  // ANDROID_ID, no el guardado: si al vincular el equipo ya era de otro negocio, la app guardó un
  // id nuevo, y mandar ese como llave le daría 7 días nuevos al siguiente negocio que se cree
  // en este mismo teléfono. En la web no hay id propio, así que vale el que el navegador ya tenía.
  const idGuardado = await leerAjuste(db, AJUSTE_DISPOSITIVO);
  const equipoId =
    Platform.OS === 'web' ? (idGuardado ?? (await idTelefonoEstable())) : await idTelefonoEstable();
  const argumentos = {
    p_nombre: datos.nombreNegocio,
    p_rut: datos.rut,
    p_direccion: datos.direccion,
    p_perfil_id: perfilId,
    p_nombre_dueno: datos.nombreDueno,
    p_pin_hash: await hashPin(perfilId, datos.pin),
  };
  let { data: negocioId, error } = await supabase.rpc('crear_negocio', {
    ...argumentos,
    p_equipo_id: equipoId,
  });
  // Servidor sin la migración de la prueba por negocio: no conoce p_equipo_id. Se reintenta sin
  // él para no dejar a nadie sin poder registrarse.
  if (error && (error.code === 'PGRST202' || /schema cache/i.test(error.message))) {
    ({ data: negocioId, error } = await supabase.rpc('crear_negocio', argumentos));
  }
  if (error) throw new Error(error.message);

  // Se vincula con el id que el equipo ya tenía guardado, si lo tenía (así no ocupa otro cupo).
  return { negocioId: negocioId as string, idParaVincular: idGuardado ?? equipoId };
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
    .order('creado_en', { ascending: true });
  if (errorNegocio) throw new Error(errorNegocio.message);
  const ids = (data ?? []).map((f) => f.negocio_id as string);
  if (ids.length === 0) return { tipo: 'sin_negocio' };

  // Con varios locales se abre el último que se usó en este equipo; si no hay, el más antiguo.
  const ultimo = await leerAjuste(db, AJUSTE_ULTIMO_LOCAL);
  await vincularTelefono(db, ultimo && ids.includes(ultimo) ? ultimo : ids[0], equipo);
  return { tipo: 'listo' };
}

/** Local de la cuenta, para el selector. */
export type Local = {
  id: string;
  nombre: string;
  direccion: string | null;
  /** Estado de la suscripción del local (activa, prueba, vencida...). */
  estado: string | null;
  plan: string | null;
  /** Solo para personas con permiso multi-local: su perfil en ese local. */
  perfil_id?: string | null;
};

/** Local desde el que se llegó: permite volver aunque en el nuevo ya no haya permiso. */
type LocalOrigen = { id: string; nombre: string; perfilId: string };

const claveEquipoDeLocal = (negocioId: string) => `dispositivo:${negocioId}`;

/**
 * Locales a los que esta persona puede cambiarse. El dueño ve todos los de la cuenta; las demás
 * personas, solo donde el dueño las asignó (y mientras tengan el permiso multi-local). Requiere
 * internet. La lista sale del servidor: la app nunca decide a qué locales se entra.
 */
export async function listarLocales(perfil: Perfil): Promise<Local[]> {
  if (perfil.rol === 'dueno') {
    const { data, error } = await supabase.rpc('mis_negocios');
    if (error) throw new Error(error.message);
    return (data as Local[] | null) ?? [];
  }
  if (!perfil.persona_id) return [];
  const { data, error } = await supabase.rpc('mis_locales_como_persona', {
    p_persona_id: perfil.persona_id,
  });
  if (error) throw new Error(error.message);
  return (data as Local[] | null) ?? [];
}

/** Local desde el que se llegó a este (null si no se cambió de local). */
export async function leerLocalOrigen(db: BaseLocal): Promise<LocalOrigen | null> {
  const texto = await leerAjuste(db, AJUSTE_LOCAL_ORIGEN);
  if (!texto) return null;
  try {
    return JSON.parse(texto) as LocalOrigen;
  } catch {
    return null;
  }
}

/** Solo cambia de local quien es dueño o tiene el permiso multi-local. */
const puedeCambiarDeLocal = (perfil: Perfil) =>
  permisosDePerfil(perfil).includes(PERMISO_MULTI_LOCAL);

/**
 * Antes de cambiar de local: sincroniza y comprueba que no queden cambios sin subir. Al cambiar
 * se borran los datos de este equipo y se bajan los del otro local; sin esta guarda se
 * perderían ventas hechas sin internet.
 */
async function exigirTodoSubido(db: BaseLocal, negocioId: string): Promise<void> {
  try {
    await sincronizar(db, remotoSupabase, negocioId);
  } catch (e) {
    throw new Error(
      `No se pudo sincronizar antes de cambiar de local (necesitas internet). ${mensajeDeError(e)}`,
    );
  }
  await exigirSinPendientes(db);
}

async function exigirSinPendientes(db: BaseLocal): Promise<void> {
  if ((await contarPendientes(db)) > 0) {
    throw new Error(
      'Hay cambios sin subir. Espera a que termine de sincronizar y vuelve a intentarlo.',
    );
  }
}

/**
 * Cambia a otro local de la cuenta sin cerrar sesión. Requiere internet y que no haya cambios
 * sin subir. Este equipo se libera del local que deja (no gasta cupo en varios locales) y se
 * vincula al nuevo; después hay que ingresar el PIN de ese local.
 */
export async function cambiarDeLocal(db: BaseLocal, destinoId: string): Promise<void> {
  const { negocioId: origenId, perfil } = useSesion.getState();
  if (!origenId || !perfil) throw new Error('La sesión expiró. Vuelve a ingresar.');
  if (destinoId === origenId) return;

  const origen = await leerLocalOrigen(db);
  const volviendo = origen?.id === destinoId;
  let perfilDestinoId: string | null = null;
  if (volviendo) {
    perfilDestinoId = origen.perfilId;
  } else {
    if (!puedeCambiarDeLocal(perfil)) throw new Error('No tienes permiso para cambiar de local.');
    const destino = (await listarLocales(perfil)).find((l) => l.id === destinoId);
    if (!destino) throw new Error('Ese local no está disponible para ti.');
    perfilDestinoId = destino.perfil_id ?? null;
  }

  // Mientras se reemplaza la base no puede correr la sincronización automática: seguiría bajando
  // datos del local anterior dentro de la base ya vacía.
  await pausarSincronizacion();
  try {
    await exigirTodoSubido(db, origenId);
    await moverEquipo(db, { origenId, destinoId, perfil, volviendo });
  } finally {
    reanudarSincronizacion();
  }

  // Al llegar al local, se marca quién debería ser (el dueño o la persona asignada).
  let sugerido = perfilDestinoId;
  if (!sugerido && perfil.rol === 'dueno') {
    sugerido =
      (await listarPerfiles(db, destinoId, { soloActivos: true })).find((p) => p.rol === 'dueno')
        ?.id ?? null;
  }
  useSesion.getState().fijarPerfilSugerido(sugerido);
}

async function moverEquipo(
  db: BaseLocal,
  datos: { origenId: string; destinoId: string; perfil: Perfil; volviendo: boolean },
): Promise<void> {
  const { origenId, destinoId, perfil, volviendo } = datos;
  const idActual = await leerAjuste(db, AJUSTE_DISPOSITIVO);
  if (idActual) await guardarAjuste(db, claveEquipoDeLocal(origenId), idActual);
  const nombreOrigen = (await obtenerNegocio(db, origenId))?.nombre ?? '';

  // Cada local cuenta sus equipos: se usa el id que este equipo ya tenía en ese local (si lo
  // tenía) o uno nuevo. Se registra ANTES de borrar nada: si el local está al tope de equipos,
  // el error llega sin haber tocado los datos de este equipo.
  let equipoDestino = (await leerAjuste(db, claveEquipoDeLocal(destinoId))) ?? randomUUID();
  const registrar = (id: string) =>
    supabase.rpc('registrar_dispositivo', {
      p_id: id,
      p_negocio_id: destinoId,
      p_nombre: nombreDelTelefono(),
      ...(Platform.OS === 'web' ? { p_tipo: 'pc' } : {}),
    });
  let { error } = await registrar(equipoDestino);
  if (error && /DISPOSITIVO_DE_OTRO_NEGOCIO/.test(error.message)) {
    equipoDestino = randomUUID();
    ({ error } = await registrar(equipoDestino));
  }
  if (error) throw new Error(error.message);

  // Lo último antes de borrar: pudo entrar una venta mientras se registraba el equipo.
  try {
    await exigirSinPendientes(db);
  } catch (e) {
    await liberarEquipo(equipoDestino);
    throw e;
  }

  try {
    await vincularTelefono(db, destinoId, undefined, equipoDestino);
  } catch (e) {
    // Los datos ya se borraron: se libera el cupo del destino y se intenta volver al local de
    // origen. Si tampoco se puede, el equipo queda sin datos y se pide ingresar de nuevo.
    await liberarEquipo(equipoDestino);
    const volvio = await vincularTelefono(db, origenId, undefined, idActual ?? undefined).then(
      () => true,
      () => false,
    );
    if (!volvio) {
      const sesion = useSesion.getState();
      sesion.desvincular();
      sesion.fijarAvisoSalida('No se pudo completar el cambio de local. Ingresa de nuevo.');
    }
    throw e;
  }

  await guardarAjuste(
    db,
    AJUSTE_LOCAL_ORIGEN,
    volviendo ? '' : JSON.stringify({ id: origenId, nombre: nombreOrigen, perfilId: perfil.id }),
  );
  // Libera el cupo del local que se dejó. Si falla, el equipo queda ocupándolo hasta que el
  // dueño lo desvincule en Suscripción.
  if (idActual && idActual !== equipoDestino) await liberarEquipo(idActual);
}

/** Desvincula un equipo para liberar su cupo; si falla no se interrumpe nada. */
const liberarEquipo = (id: string) =>
  supabase.rpc('desvincular_dispositivo', { p_id: id }).then(undefined, () => {});

/** El local se creó en el servidor, pero no se pudo pasar a él (no hay que crearlo otra vez). */
export class LocalCreadoSinCambio extends Error {
  constructor(motivo: string) {
    super(`El local se creó, pero no se pudo cambiar a él: ${motivo} Ábrelo desde «Mis locales».`);
    this.name = 'LocalCreadoSinCambio';
  }
}

/**
 * Crea un local nuevo para la cuenta con sesión iniciada y se cambia a él. Solo el dueño. Los
 * cambios sin subir se comprueban antes de crear nada en el servidor.
 */
export async function agregarLocal(db: BaseLocal, datos: DatosNegocio): Promise<void> {
  const { negocioId, perfil } = useSesion.getState();
  if (!negocioId || perfil?.rol !== 'dueno') {
    throw new Error('Solo el dueño puede agregar locales.');
  }
  await exigirTodoSubido(db, negocioId);
  const { negocioId: nuevoId } = await crearNegocioEnServidor(db, datos);
  try {
    await cambiarDeLocal(db, nuevoId);
  } catch (e) {
    throw new LocalCreadoSinCambio(mensajeDeError(e));
  }
}

/**
 * Da acceso a una persona a otro local: el servidor crea su perfil allá, unido al de aquí por
 * persona_id, con el PIN que el dueño escribe. Solo el dueño. Requiere internet. El perfil nuevo
 * parte con los permisos indicados más multi-local; después se editan en ese local.
 */
export async function asignarPersonaALocal(
  db: BaseLocal,
  datos: {
    perfilId: string;
    nombre: string;
    negocioDestino: string;
    pin: string;
    permisos: readonly Permiso[];
  },
): Promise<void> {
  const { perfil, negocioId } = useSesion.getState();
  if (perfil?.rol !== 'dueno' || !negocioId) {
    throw new Error('Solo el dueño puede asignar personas a otros locales.');
  }
  // La persona tiene que estar en el servidor: él arma la unión (persona_id) a partir de su perfil.
  try {
    await sincronizar(db, remotoSupabase, negocioId);
  } catch (e) {
    throw new Error(`Necesitas internet para asignar a otro local. ${mensajeDeError(e)}`);
  }
  const nuevoId = randomUUID();
  const { error } = await supabase.rpc('asignar_persona_a_local', {
    p_perfil_id: nuevoId,
    p_negocio_destino: datos.negocioDestino,
    p_nombre: datos.nombre,
    p_pin_hash: await hashPin(nuevoId, datos.pin),
    p_perfil_origen: datos.perfilId,
    p_permisos: [...datos.permisos],
  });
  if (error) {
    if (/PERSONA_YA_ASIGNADA/.test(error.message)) {
      throw new Error('Esta persona ya está asignada a ese local.');
    }
    throw new Error(error.message);
  }
  // Baja el persona_id que el servidor le puso al perfil de aquí.
  await sincronizar(db, remotoSupabase, negocioId).catch(() => {});
}

/** Cierra la sesión y borra los datos del negocio guardados en este teléfono. */
export async function cerrarSesion(db: BaseLocal): Promise<void> {
  // scope local: funciona sin internet.
  await supabase.auth.signOut({ scope: 'local' });
  await borrarDatosLocales(db);
  await guardarAjuste(db, AJUSTE_LOCAL_ORIGEN, '');
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
  useSesion
    .getState()
    .fijarAvisoSalida(
      'Tu negocio y todos sus datos fueron eliminados. Si tienes otros locales, ingresa de nuevo para verlos.',
    );
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
  /** Id ya decidido (al crear el negocio): el mismo que se mandó como llave de la prueba. */
  idDecidido?: string,
): Promise<void> {
  const esPc = Platform.OS === 'web';

  // Si el equipo ya tenía id (instalaciones anteriores) se conserva, para no ocupar otro cupo.
  // (borrarDatosLocales no borra ese ajuste.) La pregunta de reemplazo va antes del borrado:
  // si se cancela, los datos locales quedan como estaban. En un negocio recién creado no hay
  // nada que reemplazar, así que ese camino solo corre al iniciar sesión.
  let dispositivoId = idDecidido ?? (await leerAjuste(db, AJUSTE_DISPOSITIVO));
  if (!dispositivoId && esPc && equipo?.elegirReemplazo) {
    const pcs = await pcVinculados(negocioId);
    if (pcs.length) dispositivoId = await equipo.elegirReemplazo(pcs);
  }
  await borrarDatosLocales(db);
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
  await guardarAjuste(db, AJUSTE_ULTIMO_LOCAL, negocioId);
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
