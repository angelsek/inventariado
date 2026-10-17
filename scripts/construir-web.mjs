#!/usr/bin/env node
// Termina el build de la versión web (PC) después de `npx expo export --platform web`:
//   1. Escribe dist/_headers (cabeceras de Cloudflare Pages) con la política de contenido,
//      que solo permite conectarse al proyecto de Supabase de este build.
//   2. Genera el service worker (dist/sw.js) con Workbox, para que la web abra sin internet.
// Uso: npm run web:construir. La URL de Supabase sale de EXPO_PUBLIC_SUPABASE_URL o, si no
// está, de .env.local / .env (igual que expo export). Ver docs/WEB.md.
import { readFileSync, writeFileSync } from 'node:fs';

import { generateSW } from 'workbox-build';

const DIST = 'dist';

function urlSupabase() {
  if (process.env.EXPO_PUBLIC_SUPABASE_URL) return process.env.EXPO_PUBLIC_SUPABASE_URL;
  for (const archivo of ['.env.local', '.env']) {
    try {
      const linea = readFileSync(archivo, 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith('EXPO_PUBLIC_SUPABASE_URL='));
      if (linea) return linea.slice('EXPO_PUBLIC_SUPABASE_URL='.length).trim();
    } catch {
      // No existe: se prueba el siguiente.
    }
  }
  return '';
}

/** Política de contenido: solo código propio y conexiones al proyecto de Supabase. */
export function politicaDeContenido(url) {
  let conexiones = "'self'";
  try {
    const { protocol, host } = new URL(url);
    if (protocol === 'https:' && host) conexiones += ` https://${host} wss://${host}`;
  } catch {
    // Sin Supabase: la web funciona solo con la base local.
  }
  return [
    "default-src 'self'",
    // SQLite corre como WebAssembly (expo-sqlite web).
    "script-src 'self' 'wasm-unsafe-eval'",
    // Expo arranca el worker de SQLite desde un blob: que importa el worker propio.
    "worker-src 'self' blob:",
    // react-native-web inserta estilos en la página.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${conexiones}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function escribirCabeceras() {
  const comunes = {
    'Content-Security-Policy': politicaDeContenido(urlSupabase()),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  };
  const bloque = (ruta, cabeceras) =>
    [ruta, ...Object.entries(cabeceras).map(([k, v]) => `  ${k}: ${v}`)].join('\n');
  const texto = [
    bloque('/*', comunes),
    // El service worker y la página siempre se revisan, para que las versiones nuevas lleguen.
    bloque('/sw.js', { 'Cache-Control': 'no-cache' }),
    bloque('/index.html', { 'Cache-Control': 'no-cache' }),
    bloque('/_expo/static/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
  ].join('\n\n');
  writeFileSync(`${DIST}/_headers`, `${texto}\n`);
}

async function generarServiceWorker() {
  const { count, size, warnings } = await generateSW({
    globDirectory: DIST,
    globPatterns: ['**/*.{js,html,wasm,ttf,ico,png,webmanifest}'],
    // Expo deja la fuente de íconos y el SQLite (.wasm) bajo assets/node_modules/, que Workbox
    // ignora por defecto: sin ellos la web no abriría sin internet.
    globIgnores: ['sw.js', 'workbox-*.js'],
    swDest: `${DIST}/sw.js`,
    // El bundle de la app pesa ~2 MB, más que el límite por defecto.
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
    // Cualquier ruta de la app abre index.html (Expo Router decide la pantalla).
    navigateFallback: '/index.html',
    // La versión nueva espera hasta que la app la active (aviso "Actualizar", sin venta en curso).
    skipWaiting: false,
    clientsClaim: false,
    cleanupOutdatedCaches: true,
    // Los nombres de los bundles ya cambian con cada versión (hash).
    dontCacheBustURLsMatching: /\/_expo\/static\//,
  });
  for (const aviso of warnings) console.warn(aviso);
  console.log(`Service worker: ${count} archivos, ${(size / 1e6).toFixed(1)} MB.`);
}

escribirCabeceras();
await generarServiceWorker();
