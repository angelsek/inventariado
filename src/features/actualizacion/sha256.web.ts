/** Web (PC): no se descargan APK, así que no hay archivos que verificar. */
export function sha256Archivo(): Promise<string> {
  return Promise.reject(new Error('No disponible en la versión web.'));
}
