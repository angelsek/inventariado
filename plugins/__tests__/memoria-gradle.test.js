// expo/config-plugins arrastra módulos ESM que Jest no lee; aquí solo se prueba la función pura.
jest.mock('expo/config-plugins', () => ({ withGradleProperties: jest.fn() }));

const { fijarPropiedad, JVM_ARGS } = require('../memoria-gradle');

it('reemplaza la memoria de Gradle que deja expo prebuild y no toca lo demás', () => {
  const propiedades = [
    { type: 'comment', value: 'Gradle' },
    { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m -XX:MaxMetaspaceSize=512m' },
    { type: 'property', key: 'android.useAndroidX', value: 'true' },
  ];
  const resultado = fijarPropiedad(propiedades, 'org.gradle.jvmargs', JVM_ARGS);
  expect(resultado.filter((p) => p.key === 'org.gradle.jvmargs')).toEqual([
    { type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS },
  ]);
  expect(resultado).toContainEqual({ type: 'property', key: 'android.useAndroidX', value: 'true' });
  expect(resultado).toContainEqual({ type: 'comment', value: 'Gradle' });
});
