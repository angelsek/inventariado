import { useSesion } from '@/sesion/store';

import { supabase, supabaseConfigurado } from './supabase';
import { nombreDispositivo, versionActual } from './version';

/**
 * Envía un error al servidor para que el administrador lo vea (Más → Administración →
 * Reportes). Nunca falla: si no hay internet, el error simplemente no se informa.
 */
export async function informarError(error: unknown, contexto?: string): Promise<void> {
  if (!supabaseConfigurado) return;
  try {
    const e = error instanceof Error ? error : new Error(String(error));
    await supabase.rpc('registrar_error', {
      p_mensaje: contexto ? `${contexto}: ${e.message}` : e.message,
      p_detalle: e.stack ?? null,
      p_version: versionActual().texto,
      p_dispositivo: nombreDispositivo(),
      p_negocio_id: useSesion.getState().negocioId,
    });
  } catch {
    // Sin conexión o servidor no disponible: se ignora.
  }
}

type ManejadorGlobal = (error: unknown, esFatal?: boolean) => void;
type ErrorUtilsRN = {
  getGlobalHandler(): ManejadorGlobal;
  setGlobalHandler(manejador: ManejadorGlobal): void;
};

let instalado = false;

/** Informa los errores no capturados de JavaScript, además del comportamiento normal. */
export function instalarManejadorErrores(): void {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsRN }).ErrorUtils;
  if (instalado || !utils) return;
  instalado = true;
  const anterior = utils.getGlobalHandler();
  utils.setGlobalHandler((error, esFatal) => {
    informarError(error, esFatal ? 'Error fatal' : 'Error no capturado');
    anterior(error, esFatal);
  });
}
