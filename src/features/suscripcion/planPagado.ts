import { primerSegmento } from '@/features/permisos/permisos';
import { avisar } from '@/lib/dialogo';
import { useSesion } from '@/sesion/store';

import type { EstadoSuscripcion } from './estado';

/**
 * Sacar datos de la app (los CSV para Excel) es parte del plan pagado: durante la
 * prueba gratis, el período de gracia y la suspensión queda con candado. Así nadie
 * se lleva el catálogo al terminar la prueba para abrir otra cuenta y empezar de
 * nuevo. No lo bloquea esta regla: importar (para poder evaluar la app con los
 * productos propios; la suspensión sí lo bloquea, por ser un cambio de datos) y el
 * respaldo completo (es el derecho a llevarse sus datos que prometen los Términos;
 * además no se puede volver a importar, solo se importa CSV).
 *
 * Es una regla de producto aplicada en el equipo, no una frontera de seguridad: se
 * puede saltar editando la base local o parchando el JS en la web, y el respaldo
 * completo entrega los mismos datos.
 *
 * Ojo con Google Play: la prueba de Google deja "pagado_hasta" puesto, así que ahí
 * el estado es 'activa' y sí se puede exportar. El candado se ve en el APK y en la
 * web (el cobro con Play está en pausa, ver docs/COBRO_GOOGLE_PLAY.md).
 */

export const MENSAJE_PLAN_PAGADO =
  'Exportar tus datos a Excel es parte del plan pagado: con la prueba gratis, o si tu suscripción ' +
  'no está al día, no está disponible. El respaldo completo de tu negocio sí lo puedes descargar, ' +
  'en Más → Exportar datos. Si ya pagaste, toca Más → Sincronizar ahora.';

/**
 * El negocio que nació sin prueba gratis (su equipo, su correo o su RUT ya la usaron) tampoco
 * puede exportar, pero el mensaje de arriba empieza hablando de "la prueba gratis" y a él no le
 * calza: nunca la tuvo. Ver `sinPrueba` en ./estado.
 */
export const MENSAJE_PLAN_PAGADO_SIN_PRUEBA =
  'Exportar tus datos a Excel es parte del plan pagado, y este negocio no tiene plan: la prueba ' +
  'gratis ya se usó con este equipo, este correo o este RUT. El respaldo completo de tu negocio sí ' +
  'lo puedes descargar, en Más → Exportar datos. Revisa Más → Suscripción para contratar.';

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
  // Un solo aviso para la prueba, la gracia y la suspensión: el de solo lectura habla de vender
  // y de hacer cambios, y no explicaría por qué no se puede exportar. El que nunca tuvo prueba
  // recibe el suyo, porque ese mensaje empieza hablando de una prueba que no existió.
  if (suscripcion?.sinPrueba) avisar('Solo con plan pagado', MENSAJE_PLAN_PAGADO_SIN_PRUEBA);
  else avisar('Solo con plan pagado', MENSAJE_PLAN_PAGADO);
  return true;
}

/** Rutas que piden plan pagado (para dibujar el candado en los menús). */
export const RUTAS_PLAN_PAGADO = ['/exportar'];

/** ¿`ruta` pide plan pagado? Compara el primer segmento, como `puedeAbrir`. */
export function requierePlanPagado(ruta: string): boolean {
  return RUTAS_PLAN_PAGADO.includes(primerSegmento(ruta));
}
