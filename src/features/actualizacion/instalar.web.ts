/**
 * Escritorio: todavía no instala actualizaciones (CANAL 'escritorio' no consulta
 * ultima_version(), que solo publica APK). El actualizador propio llega con el instalador.
 */
export async function descargarEInstalar(): Promise<void> {
  throw new Error('Las actualizaciones del escritorio todavía no están disponibles.');
}

export function limpiarDescargas() {}
