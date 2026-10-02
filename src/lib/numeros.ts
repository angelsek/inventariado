/**
 * Convierte lo que escribe el usuario en un monto en pesos: "$1.990" -> 1990.
 * Devuelve null si no hay un número válido.
 */
export function parsearMonto(texto: string): number | null {
  const limpio = texto.replace(/[$\s.]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
  return Math.round(Number(limpio));
}

/**
 * Convierte una cantidad que puede tener decimales (ej. kilos): "1,5" -> 1.5.
 * Acepta coma o punto decimal. Devuelve null si no es válida.
 */
export function parsearCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;
  return Number(limpio);
}

/** Muestra una cantidad con coma decimal y sin ceros sobrantes: 1.5 -> "1,5", 3 -> "3". */
export function formatearCantidad(cantidad: number): string {
  const redondeado = Math.round(cantidad * 1000) / 1000;
  return String(redondeado).replace('.', ',');
}
