import { parsearCantidad } from '@/lib/numeros';

/**
 * Multiplicador escrito antes de escanear: "3*" y luego el código agrega 3 unidades.
 * `texto` es lo que hay en el buscador (incluye el código si lo tecleó la pistola).
 */
export function leerMultiplicador(texto: string): number {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*\*/.exec(texto);
  if (!m) return 1;
  const cantidad = parsearCantidad(m[1]);
  return cantidad && cantidad > 0 ? cantidad : 1;
}

/**
 * Recuerda el monto recibido que había antes de la última ráfaga de teclas. Si la pistola
 * lee un código con el cursor en "monto recibido", sus dígitos quedan escritos ahí (el error
 * clásico de las cajas: cobrar $7.801.610.001.196); con esto se vuelve al monto anterior.
 */
export function crearMemoriaRecibido(maxEntreTeclasMs: number) {
  let estable = '';
  let ultimoCambio = -Infinity;
  return {
    /** Avisa un cambio del campo: `anterior` es el valor que tenía antes de este cambio. */
    cambio(anterior: string, ms: number) {
      if (ms - ultimoCambio > maxEntreTeclasMs) estable = anterior;
      ultimoCambio = ms;
    },
    /** Monto que había antes de la ráfaga en curso. */
    antesDeLaRafaga: () => estable,
  };
}
