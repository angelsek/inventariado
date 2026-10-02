import type { ConfigContext, ExpoConfig } from 'expo/config';

// Extiende app.json. En CI se usa ANDROID_VERSION_CODE para que cada APK tenga
// un versionCode mayor que el anterior y se pueda instalar encima.
export default ({ config }: ConfigContext): ExpoConfig => {
  const versionCode = Number(process.env.ANDROID_VERSION_CODE ?? config.android?.versionCode ?? 1);
  // El APK directo se actualiza solo (descarga la versión nueva y abre el instalador), para lo
  // que necesita este permiso. Google Play no lo acepta: ahí las actualizaciones las da Play.
  const permissions =
    process.env.EXPO_PUBLIC_CANAL === 'play'
      ? config.android?.permissions
      : [...(config.android?.permissions ?? []), 'android.permission.REQUEST_INSTALL_PACKAGES'];

  return {
    ...config,
    name: config.name ?? 'Stockeao',
    slug: config.slug ?? 'stockeao',
    android: { ...config.android, versionCode, permissions },
  };
};
