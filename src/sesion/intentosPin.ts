/**
 * Límite de intentos del PIN: tras MAX_INTENTOS fallos seguidos, ese perfil espera
 * ESPERA_MS antes de volver a intentar. Vive en memoria (se reinicia al cerrar la
 * app): basta para que nadie pruebe los 10.000 PIN a mano frente a la caja.
 */
export const MAX_INTENTOS = 5;
export const ESPERA_MS = 30_000;

type Registro = { fallos: number; bloqueadoHasta: number };

const registros = new Map<string, Registro>();

/** Milisegundos que faltan para poder intentar de nuevo (0: puede intentar ya). */
export function esperaRestante(perfilId: string, ahora = Date.now()): number {
  const registro = registros.get(perfilId);
  return registro ? Math.max(0, registro.bloqueadoHasta - ahora) : 0;
}

/** Anota un PIN incorrecto. Devuelve la espera que queda (0 si aún no se bloquea). */
export function registrarFallo(perfilId: string, ahora = Date.now()): number {
  const registro = registros.get(perfilId) ?? { fallos: 0, bloqueadoHasta: 0 };
  registro.fallos += 1;
  if (registro.fallos >= MAX_INTENTOS) {
    registro.fallos = 0;
    registro.bloqueadoHasta = ahora + ESPERA_MS;
  }
  registros.set(perfilId, registro);
  return esperaRestante(perfilId, ahora);
}

export function registrarAcierto(perfilId: string): void {
  registros.delete(perfilId);
}

/** Solo para pruebas. */
export function reiniciarIntentos(): void {
  registros.clear();
}
