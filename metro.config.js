// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Versión web (PC): expo-sqlite web carga SQLite como .wasm.
config.resolver.assetExts.push('wasm');

// Cabeceras que pide la documentación de expo-sqlite web, en `npx expo start`. El sitio
// publicado debe enviar las mismas (lo hace el build de publicación de la web).
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
