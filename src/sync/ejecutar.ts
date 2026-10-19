import { AJUSTE_DISPOSITIVO, leerAjuste } from '@/db/ajustes';
import { marcarSincronizado } from '@/db/dispositivos';
import { obtenerPerfil } from '@/db/perfiles';
import { dispositivoDesvinculado, obtenerEstadoSuscripcion } from '@/db/suscripcion';
import type { BaseLocal } from '@/db/tipos';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { cerrarSesion } from '@/sesion/cuenta';
import { cargarRolSesion } from '@/sesion/permisos';
import { useSesion } from '@/sesion/store';

import { contarPendientes, sincronizar } from './motor';
import { remotoSupabase } from './remotoSupabase';

let enCurso: Promise<void> | null = null;

/**
 * Sincroniza con el servidor y actualiza el estado visible en la app.
 * Si ya hay una sincronización en curso, espera esa en vez de iniciar otra.
 */
export function sincronizarAhora(db: BaseLocal): Promise<void> {
  enCurso ??= ejecutar(db).finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function ejecutar(db: BaseLocal): Promise<void> {
  const sesion = useSesion.getState();
  const negocioId = sesion.negocioId;
  if (!negocioId) return;

  sesion.actualizarSync({ estado: 'sincronizando' });
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('La sesión expiró. Vuelve a iniciar sesión.');

    const dispositivoId = await leerAjuste(db, AJUSTE_DISPOSITIVO);
    if (dispositivoId) await marcarSincronizado(db, dispositivoId, new Date());

    const resultado = await sincronizar(db, remotoSupabase, negocioId);
    if (resultado.descargadas > 0) useSesion.getState().datosCambiaron();

    // Otro teléfono desvinculó a este (para liberar cupo del plan): se cierra la sesión.
    if (dispositivoId && (await dispositivoDesvinculado(db, dispositivoId))) {
      await cerrarSesion(db);
      useSesion.getState().fijarAvisoSalida('Este equipo fue desvinculado del negocio.');
      return;
    }
    useSesion.getState().fijarSuscripcion(await obtenerEstadoSuscripcion(db, negocioId));

    await expulsarPerfilDesactivado(db);
    useSesion.getState().actualizarSync({
      estado: 'ok',
      ultima: new Date().toISOString(),
      error: null,
      pendientes: await contarPendientes(db),
    });
  } catch (error) {
    useSesion.getState().actualizarSync({
      estado: 'error',
      error: mensajeDeError(error),
      pendientes: await contarPendientes(db),
    });
  }
}

/**
 * Si otro teléfono desactivó al perfil que está usando la app, vuelve a la pantalla de PIN.
 * Si le cambió el rol o los permisos, se aplican sin cerrar la sesión.
 */
async function expulsarPerfilDesactivado(db: BaseLocal) {
  const { perfil, salir, refrescarPerfil } = useSesion.getState();
  if (!perfil) return;
  const actual = await obtenerPerfil(db, perfil.id);
  if (!actual || !actual.activo) return salir();
  const rol = await cargarRolSesion(db, actual);
  // Si mientras tanto la persona cambió de usuario, no se pisa la sesión nueva.
  if (useSesion.getState().perfil?.id === actual.id) refrescarPerfil(actual, rol);
}
