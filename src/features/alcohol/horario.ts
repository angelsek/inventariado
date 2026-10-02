/** Horario de venta de alcohol del local (según su patente), en hora local. */

/** Normaliza "9:5", "0905" o "09:05" a "09:05"; null si no es una hora válida. */
export function normalizarHora(texto: string): string | null {
  const limpio = texto.trim();
  const partes = limpio.includes(':')
    ? limpio.split(':')
    : limpio.length > 2
      ? [limpio.slice(0, -2), limpio.slice(-2)]
      : [limpio, '0'];
  if (partes.length !== 2 || !partes.every((p) => /^\d{1,2}$/.test(p))) return null;
  const [h, m] = partes.map(Number);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const minutos = (hora: string) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};

/**
 * ¿Se puede vender alcohol a esta hora? El horario puede pasar la medianoche
 * (ej. 10:00 a 02:00). Sin horario configurado, siempre se puede.
 */
export function dentroDelHorario(ahora: Date, desde: string | null, hasta: string | null): boolean {
  if (!desde || !hasta) return true;
  const actual = ahora.getHours() * 60 + ahora.getMinutes();
  const inicio = minutos(desde);
  const fin = minutos(hasta);
  if (inicio === fin) return true;
  return inicio < fin ? actual >= inicio && actual < fin : actual >= inicio || actual < fin;
}
