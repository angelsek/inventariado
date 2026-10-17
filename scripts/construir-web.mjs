#!/usr/bin/env node
// Termina el build de la versión web (PC) después de `npx expo export --platform web`:
//   1. Escribe dist/_headers (cabeceras que aplica Cloudflare) con la política de contenido,
//      que solo permite conectarse al proyecto de Supabase de este build.
//   2. Genera los íconos de la app instalable (dist/icono-192.png y 512) desde assets/icon.png.
//   3. Genera el service worker (dist/sw.js) desde scripts/sw-plantilla.js, con la lista de
//      archivos de la app y una versión que cambia si cambia cualquiera de ellos.
// Uso: npm run web:construir. La URL de Supabase sale de EXPO_PUBLIC_SUPABASE_URL o, si no
// está, de .env.local / .env (igual que expo export). Ver docs/WEB.md.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import Jimp from 'jimp-compact';

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

// Al publicar (EXIGIR_SUPABASE=true en el workflow) falta la URL de Supabase = build inútil:
// la web no podría sincronizar y la CSP no permitiría conectarse.
if (process.env.EXIGIR_SUPABASE === 'true' && !urlSupabase().startsWith('https://')) {
  console.error('Falta EXPO_PUBLIC_SUPABASE_URL (https://…): no se publica una web sin Supabase.');
  process.exit(1);
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

// Archivos que guarda el service worker (Expo deja la fuente de íconos y el SQLite .wasm
// bajo dist/assets/node_modules/: también se incluyen).
const GUARDAR = /\.(js|html|wasm|ttf|ico|png|webmanifest)$/;
const NO_GUARDAR = new Set(['sw.js']);

function archivosDe(carpeta, base = carpeta) {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) return archivosDe(ruta, base);
    const relativa = path.relative(base, ruta).split(path.sep).join('/');
    return GUARDAR.test(relativa) && !NO_GUARDAR.has(relativa) ? [relativa] : [];
  });
}

function generarServiceWorker() {
  const archivos = archivosDe(DIST).sort();
  const plantilla = readFileSync(new URL('./sw-plantilla.js', import.meta.url), 'utf8');
  // La versión cambia si cambia cualquier archivo de la app o el propio service worker.
  const huella = createHash('sha256').update(plantilla);
  for (const archivo of archivos) {
    huella.update(archivo);
    huella.update(
      createHash('sha256')
        .update(readFileSync(path.join(DIST, archivo)))
        .digest(),
    );
  }
  const version = huella.digest('hex').slice(0, 16);
  const urls = archivos.map((a) => `/${a}`);
  const codigo = plantilla
    .replace("const VERSION = '__VERSION__';", `const VERSION = ${JSON.stringify(version)};`)
    .replace('const ARCHIVOS = __ARCHIVOS__;', `const ARCHIVOS = ${JSON.stringify(urls)};`);
  writeFileSync(path.join(DIST, 'sw.js'), codigo);
  console.log(`Service worker ${version}: ${urls.length} archivos.`);
}

// Archivos de dist/ que Cloudflare no publica: los source maps y los datos internos de Expo.
function escribirExclusiones() {
  writeFileSync(
    path.join(DIST, '.assetsignore'),
    ['*.map', '**/*.map', 'metadata.json', ''].join('\n'),
  );
}

/** Íconos del manifest (public/manifest.webmanifest), a partir del ícono de la app. */
async function generarIconos() {
  for (const lado of [192, 512]) {
    const icono = await Jimp.read('assets/icon.png');
    await icono.resize(lado, lado).writeAsync(path.join(DIST, `icono-${lado}.png`));
  }
}

escribirCabeceras();
await generarIconos();
generarServiceWorker();
escribirExclusiones();
