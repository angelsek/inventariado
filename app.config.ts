import type { ConfigContext, ExpoConfig } from 'expo/config';

// Extiende app.json. En CI se usa ANDROID_VERSION_CODE para que cada APK tenga
// un versionCode mayor que el anterior y se pueda instalar encima.
export default ({ config }: ConfigContext): ExpoConfig => {
  const versionCode = Number(process.env.ANDROID_VERSION_CODE ?? config.android?.versionCode ?? 1);

  return {
    ...config,
    name: config.name ?? 'Stockeao',
    slug: config.slug ?? 'stockeao',
    android: { ...config.android, versionCode },
  };
};
