/** Escritorio: el instalador lo verifica el proceso principal de Electron (fase de publicación). */
export function sha256Archivo(): Promise<string> {
  return Promise.reject(new Error('No disponible en el escritorio.'));
}
