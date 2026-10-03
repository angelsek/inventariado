import { requireNativeModule } from 'expo';

type VerificadorApk = { sha256Async(uri: string): Promise<string> };

/**
 * SHA-256 (hex en minúsculas) de un archivo de la caché de la app, calculado en nativo
 * por bloques (modules/verificador-apk). expo-crypto no puede hashear archivos de ~70 MB.
 */
export function sha256Archivo(uri: string): Promise<string> {
  return requireNativeModule<VerificadorApk>('VerificadorApk').sha256Async(uri);
}
