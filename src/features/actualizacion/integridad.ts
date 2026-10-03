import { ORIGEN_APK } from '@/config';

/**
 * Primer versionCode publicado con SHA-256 (el workflow lo publica siempre desde entonces).
 * Desde esta versión, una publicación sin hash no se instala: así no queda una vía permanente
 * para saltarse la verificación. Las versiones anteriores se instalan sin verificar.
 */
export const PRIMER_CODIGO_CON_HASH = 46;

/** La descarga no coincide con el APK publicado (o no se pudo verificar): no se instala. */
export class ErrorIntegridad extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorIntegridad';
  }
}

/** La versión publicada no apunta a las Releases de Stockeao: reintentar no sirve de nada. */
export class ErrorOrigen extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorOrigen';
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
    // El prefijo siempre termina en "/": así ".../download" no acepta ".../downloadX".
    esperado = new URL(origen.endsWith('/') ? origen : `${origen}/`);
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
