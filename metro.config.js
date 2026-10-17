// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Versión web (PC): expo-sqlite web carga SQLite como .wasm (ver docs/WEB.md).
config.resolver.assetExts.push('wasm');

// Cabeceras que pide expo-sqlite web en `npx expo start`. En producción las pone
// public/_headers (Cloudflare Pages).
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
