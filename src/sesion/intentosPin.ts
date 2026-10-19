/**
 * Límite de intentos del PIN: tras MAX_INTENTOS fallos seguidos, ese perfil espera
 * antes de volver a intentar. La espera parte en ESPERA_MS y se duplica con cada
 * bloqueo seguido (hasta ESPERA_MAXIMA_MS); un acierto la reinicia. El estado se
 * guarda en la base local (ver pin.tsx), así que recargar la página o cerrar la app
 * no lo borra.
 *
 * Es un control para el uso diario frente a la caja: quien tenga acceso técnico al
 * equipo puede leer los datos locales (ver docs/PERMISOS.md).
 */
export const MAX_INTENTOS = 5;
export const ESPERA_MS = 30_000;
export const ESPERA_MAXIMA_MS = 15 * 60_000;

/** Clave en la tabla ajustes donde se guarda el estado. */
export const AJUSTE_INTENTOS_PIN = 'intentos_pin';

type Registro = { fallos: number; bloqueos: number; bloqueadoHasta: number };

const registros = new Map<string, Registro>();

/** Milisegundos que faltan para poder intentar de nuevo (0: puede intentar ya). */
export function esperaRestante(perfilId: string, ahora = Date.now()): number {
  const registro = registros.get(perfilId);
  return registro ? Math.max(0, registro.bloqueadoHasta - ahora) : 0;
}

/** Anota un PIN incorrecto. Devuelve la espera que queda (0 si aún no se bloquea). */
export function registrarFallo(perfilId: string, ahora = Date.now()): number {
  const registro = registros.get(perfilId) ?? { fallos: 0, bloqueos: 0, bloqueadoHasta: 0 };
  registro.fallos += 1;
  if (registro.fallos >= MAX_INTENTOS) {
    registro.fallos = 0;
    registro.bloqueos += 1;
    const espera = Math.min(ESPERA_MS * 2 ** (registro.bloqueos - 1), ESPERA_MAXIMA_MS);
    registro.bloqueadoHasta = ahora + espera;
  }
  registros.set(perfilId, registro);
  return esperaRestante(perfilId, ahora);
}

export function registrarAcierto(perfilId: string): void {
  registros.delete(perfilId);
}

/** Estado para guardar en la base local. */
export function exportarIntentos(): string {
  return JSON.stringify(Object.fromEntries(registros));
}

/** Restaura lo guardado; un texto ilegible se ignora. */
export function importarIntentos(texto: string | null): void {
  if (!texto) return;
  try {
    const datos = JSON.parse(texto) as Record<string, Partial<Registro>>;
    for (const [perfilId, r] of Object.entries(datos)) {
      registros.set(perfilId, {
        fallos: Number(r.fallos) || 0,
        bloqueos: Number(r.bloqueos) || 0,
        bloqueadoHasta: Number(r.bloqueadoHasta) || 0,
      });
    }
  } catch {
    // Se queda con lo que hay en memoria.
  }
}

/** Solo para pruebas. */
export function reiniciarIntentos(): void {
  registros.clear();
}
