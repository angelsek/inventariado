import { Platform } from 'react-native';

/**
 * Datos de contacto para pagar la suscripción. Se configuran como variables de
 * GitHub (SUPABASE_... ya existen; ver docs/SUPABASE.md) o en .env.local.
 */
export const CONTACTO = {
  whatsapp: process.env.EXPO_PUBLIC_CONTACTO_WHATSAPP ?? '',
  correo: process.env.EXPO_PUBLIC_CONTACTO_CORREO ?? '',
  datosTransferencia: process.env.EXPO_PUBLIC_DATOS_TRANSFERENCIA ?? '',
};

/**
 * Por dónde se instaló la app: 'play' (Google Play, que se encarga de las
 * actualizaciones), 'apk' (instalación directa, la app avisa de versiones nuevas) o
 * 'web' (versión de PC en el navegador; se cobra por transferencia, como el APK).
 * Lo fija el workflow de compilación; la web se reconoce por la plataforma.
 */
export const CANAL: 'play' | 'apk' | 'web' =
  Platform.OS === 'web' ? 'web' : process.env.EXPO_PUBLIC_CANAL === 'play' ? 'play' : 'apk';

/**
 * Único origen desde el que la app descarga e instala APK: las Releases del repositorio.
 * Lo fija el workflow "Construir APK" a partir del repositorio que compila.
 */
export const ORIGEN_APK =
  process.env.EXPO_PUBLIC_ORIGEN_APK ||
  'https://github.com/angelsek/inventariado/releases/download/';
