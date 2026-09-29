/** Inicio y fin (exclusivo) del día local de `fecha`, en ISO para consultar la base. */
export function rangoDelDia(fecha: Date): { desde: string; hasta: string } {
  const inicio = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const fin = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1);
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
}

export const sumarDias = (fecha: Date, dias: number) =>
  new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + dias);

export const esHoy = (fecha: Date) => rangoDelDia(fecha).desde === rangoDelDia(new Date()).desde;

/** Hora local "14:05". */
export function formatearHora(fecha: Date): string {
  return `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
}
