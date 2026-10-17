/**
 * Plugin de Expo: más memoria para Gradle al compilar el APK y el App Bundle.
 *
 * El proyecto que genera `expo prebuild` deja 2 GB (-Xmx2048m) y la compilación de
 * release se quedaba sin memoria ("java.lang.OutOfMemoryError: Java heap space")
 * y pegada hasta el límite de tiempo del workflow. Los equipos de GitHub Actions
 * tienen 16 GB.
 */
const { withGradleProperties } = require('expo/config-plugins');

const JVM_ARGS = '-Xmx4g -XX:MaxMetaspaceSize=1g';

function fijarPropiedad(propiedades, clave, valor) {
  const sinClave = propiedades.filter((p) => !(p.type === 'property' && p.key === clave));
  return [...sinClave, { type: 'property', key: clave, value: valor }];
}

module.exports = function memoriaGradle(config) {
  return withGradleProperties(config, (c) => {
    c.modResults = fijarPropiedad(c.modResults, 'org.gradle.jvmargs', JVM_ARGS);
    return c;
  });
};

module.exports.fijarPropiedad = fijarPropiedad;
module.exports.JVM_ARGS = JVM_ARGS;
