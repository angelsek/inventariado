import { File, Paths } from 'expo-file-system';
import { startActivityAsync } from 'expo-intent-launcher';

// Intent.FLAG_GRANT_READ_URI_PERMISSION: deja que el instalador de Android lea el archivo.
const PERMISO_LECTURA = 1;
const TIPO_APK = 'application/vnd.android.package-archive';
// Un APK de Stockeao pesa ~40 MB; algo mucho menor es una página de error, no el APK.
const TAMANO_MINIMO = 1_000_000;

const nombreApk = (codigo: number) => `stockeao-${codigo}.apk`;

/**
 * Descarga el APK de la versión nueva (si no estaba ya descargado) y abre el
 * instalador de Android. La primera vez Android pide permitir instalar apps
 * desde Stockeao; después basta con tocar "Instalar".
 */
export async function descargarEInstalar(
  url: string,
  codigo: number,
  alAvanzar: (fraccion: number) => void,
) {
  const apk = new File(Paths.cache, nombreApk(codigo));
  if (!apk.exists) {
    // Se descarga con otro nombre y se renombra al terminar: así un APK a medias
    // (sin señal, app cerrada) nunca se confunde con uno completo.
    const parcial = new File(Paths.cache, `${nombreApk(codigo)}.parcial`);
    if (parcial.exists) parcial.delete();
    await File.createDownloadTask(url, parcial, {
      onProgress: ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) alAvanzar(bytesWritten / totalBytes);
      },
    }).downloadAsync();
    if (!parcial.exists || (parcial.size ?? 0) < TAMANO_MINIMO) {
      if (parcial.exists) parcial.delete();
      throw new Error('La descarga no se completó.');
    }
    parcial.rename(nombreApk(codigo));
  }
  alAvanzar(1);
  await startActivityAsync('android.intent.action.VIEW', {
    data: apk.contentUri,
    type: TIPO_APK,
    flags: PERMISO_LECTURA,
  });
}

/** Borra los APK descargados de versiones que ya no sirven (ocupan ~40 MB cada uno). */
export function limpiarDescargas(conservar: number | null) {
  try {
    for (const item of Paths.cache.list()) {
      if (!(item instanceof File) || !/^stockeao-\d+\.apk(\.parcial)?$/.test(item.name)) continue;
      if (conservar !== null && item.name === nombreApk(conservar)) continue;
      item.delete();
    }
  } catch {
    // No es grave: se intenta de nuevo la próxima vez.
  }
}
