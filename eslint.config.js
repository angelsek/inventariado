// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    // jest.mock() necesita require() dentro de la fábrica.
    files: ['**/__tests__/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    ignores: ['node_modules/*', '.expo/*', 'android/*', 'ios/*', 'dist/*'],
  },
]);
