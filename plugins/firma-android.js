/**
 * Plugin de Expo: firma el APK de release con una clave propia cuando existen
 * las variables de entorno ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,
 * ANDROID_KEY_ALIAS y ANDROID_KEY_PASSWORD (ver docs/PILOTO.md). Sin ellas se
 * usa la clave de desarrollo, como antes.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARCA = '// firma-android: clave propia';

const CONFIG_RELEASE = `
        release {
            ${MARCA}
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }`;

function aplicarFirma(gradle) {
  if (gradle.includes(MARCA)) return gradle;

  const conConfig = gradle.replace(
    /signingConfigs \{\n(\s+debug \{[\s\S]*?\n\s+\})/,
    (bloque) => bloque + CONFIG_RELEASE,
  );
  if (conConfig === gradle) throw new Error('firma-android: no se encontró signingConfigs.debug');

  const conUso = conConfig.replace(
    /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
    "$1signingConfig System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug",
  );
  if (conUso === conConfig) throw new Error('firma-android: no se encontró buildTypes.release');
  return conUso;
}

module.exports = function firmaAndroid(config) {
  return withAppBuildGradle(config, (c) => {
    c.modResults.contents = aplicarFirma(c.modResults.contents);
    return c;
  });
};
module.exports.aplicarFirma = aplicarFirma;
