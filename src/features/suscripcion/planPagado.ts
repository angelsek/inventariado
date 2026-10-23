import { avisar } from '@/lib/dialogo';
import { useSesion } from '@/sesion/store';

import type { EstadoSuscripcion } from './estado';
import { MENSAJE_SOLO_LECTURA } from './useSoloLectura';

/**
 * Sacar datos de la app (los CSV para Excel) es parte del plan pagado: durante la
 * prueba gratis, el período de gracia y la suspensión queda con candado. Así nadie
 * se lleva el catálogo al terminar la prueba para abrir otra cuenta y empezar de
 * nuevo. Importar sigue disponible siempre, para poder evaluar la app con los
 * productos propios, y el respaldo completo también (es el derecho a llevarse sus
 * datos; además no se puede volver a importar, solo se importa CSV).
 */

export const MENSAJE_PLAN_PAGADO =
  'Exportar tus datos a Excel es parte del plan pagado: durante la prueba gratis no está disponible. ' +
  'El respaldo completo de tu negocio sí lo puedes descargar, en Más → Exportar datos. ' +
  'Si ya pagaste, toca Más → Sincronizar ahora.';

/** ¿La suscripción está pagada y al día? Sin datos todavía, se responde que no. */
export function esPlanPagado(suscripcion: EstadoSuscripcion | null): boolean {
  return suscripcion?.estado === 'activa';
}

/** true si la suscripción está pagada y al día (en prueba o vencida, false). */
export function usePlanPagado(): boolean {
  return useSesion((s) => esPlanPagado(s.suscripcion));
}

/** Para usar antes de exportar: avisa y devuelve true si no se puede exportar. */
export function bloqueadoSinPlanPagado(): boolean {
  const suscripcion = useSesion.getState().suscripcion;
  if (esPlanPagado(suscripcion)) return false;
  if (suscripcion?.soloLectura) avisar('Solo lectura', MENSAJE_SOLO_LECTURA);
  else avisar('Solo con plan pagado', MENSAJE_PLAN_PAGADO);
  return true;
}

/** Rutas que piden plan pagado (para dibujar el candado en los menús). */
export const RUTAS_PLAN_PAGADO = ['/exportar'];

/** ¿`ruta` pide plan pagado? Compara el primer segmento, como `puedeAbrir`. */
export function requierePlanPagado(ruta: string): boolean {
  const base = '/' + (ruta.split('?')[0].split('/').filter(Boolean)[0] ?? '');
  return RUTAS_PLAN_PAGADO.includes(base);
}
