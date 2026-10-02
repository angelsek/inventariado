/**
 * Formatea un monto en pesos chilenos: 1234567 -> "$1.234.567".
 * Los pesos no usan decimales, así que el monto se redondea.
 * Se implementa a mano para no depender de los datos de Intl del dispositivo.
 */
export function formatearCLP(monto: number): string {
  const redondeado = Math.round(monto);
  const signo = redondeado < 0 ? '-' : '';
  const miles = Math.abs(redondeado)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$${miles}`;
}

const dosDigitos = (n: number) => n.toString().padStart(2, '0');

/** Fecha en formato chileno: "29-09-2026". */
export function formatearFecha(fecha: Date): string {
  return `${dosDigitos(fecha.getDate())}-${dosDigitos(fecha.getMonth() + 1)}-${fecha.getFullYear()}`;
}

/** Fecha y hora: "29-09-2026 14:05". */
export function formatearFechaHora(fecha: Date): string {
  return `${formatearFecha(fecha)} ${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`;
}
