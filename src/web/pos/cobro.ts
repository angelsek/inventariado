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
 * Si la pistola lee un código mientras el cursor está en "monto recibido", los dígitos
 * del código quedan escritos ahí. Esto los quita (el error clásico de las cajas: cobrar
 * $7.801.610.001.196 por escanear con el campo de monto activo).
 */
export function quitarLectura(valor: string, codigo: string): string {
  return valor.endsWith(codigo) ? valor.slice(0, -codigo.length) : valor;
}
