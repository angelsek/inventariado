/**
 * Web (PC): no instala APK. La web se actualiza con su service worker
 * (web/plataforma/serviceWorker.ts) y el CANAL 'web' no consulta ultima_version().
 */
export async function descargarEInstalar(): Promise<void> {
  throw new Error('La versión web no instala APK.');
}

export function limpiarDescargas() {}
