import { getAndroidId } from 'expo-application';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';

import { uuidDesdeHuella } from './uuidDesdeHuella';

/**
 * Id con que el teléfono ocupa un cupo del plan. Se deriva del ANDROID_ID, que Android
 * mantiene aunque se desinstale la app (cambia solo al restablecer el teléfono de fábrica):
 * así reinstalar Stockeao no gasta otro cupo. No se guarda el ANDROID_ID, solo su huella.
 */
export async function idTelefonoEstable(): Promise<string> {
  let androidId = '';
  try {
    androidId = getAndroidId();
  } catch {
    // Sin ANDROID_ID (pruebas, plataformas raras): id al azar, como antes.
  }
  return androidId ? idDesdeAndroidId(androidId) : randomUUID();
}

/** UUID (versión 5, con forma válida para Postgres) a partir de la huella SHA-256 del ANDROID_ID. */
export async function idDesdeAndroidId(androidId: string): Promise<string> {
  const h = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `stockeao-telefono:${androidId}`);
  return uuidDesdeHuella(h);
}
