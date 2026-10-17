/**
 * Web (PC): no instala APK. El CANAL 'web' no consulta ultima_version() (solo publica APK):
 * la web se actualiza al publicar una versión nueva del sitio.
 */
export async function descargarEInstalar(): Promise<void> {
  throw new Error('La versión web no instala APK.');
}

export function limpiarDescargas() {}
