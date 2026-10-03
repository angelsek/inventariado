import { ORIGEN_APK } from '@/config';

/** La descarga no coincide con el APK publicado (hash distinto u origen no permitido): no se instala. */
export class ErrorIntegridad extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorIntegridad';
  }
}

/**
 * ¿La URL es una descarga de las Releases del repositorio de Stockeao?
 * Exige https, el host exacto, sin usuario ni contraseña en la URL y el prefijo de ruta exacto
 * (ORIGEN_APK, p. ej. https://github.com/angelsek/inventariado/releases/download/).
 */
export function urlApkPermitida(url: string, origen: string = ORIGEN_APK): boolean {
  let destino: URL;
  let esperado: URL;
  try {
    destino = new URL(url);
    esperado = new URL(origen);
  } catch {
    return false;
  }
  return (
    destino.protocol === 'https:' &&
    destino.protocol === esperado.protocol &&
    destino.host === esperado.host &&
    destino.username === '' &&
    destino.password === '' &&
    destino.pathname.startsWith(esperado.pathname) &&
    destino.pathname.length > esperado.pathname.length
  );
}

/** Compara dos SHA-256 en hex sin importar mayúsculas ni espacios. */
export function hashesCoinciden(a: string, b: string): boolean {
  const limpio = (h: string) => h.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(limpio(a)) && limpio(a) === limpio(b);
}
