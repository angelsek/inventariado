#!/usr/bin/env node
// Sirve la versión web exportada (dist/) en http://localhost:8080 con las mismas cabeceras
// que public/_headers, para probarla sin internet antes de publicarla:
//   npx expo export --platform web && node scripts/servir-web.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const RAIZ = path.resolve('dist');
const PUERTO = Number(process.env.PUERTO ?? 8080);
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.css': 'text/css',
};

/** Cabeceras de dist/_headers que aplican a todas las rutas (bloque "/*"). */
async function cabeceras() {
  const resultado = {};
  try {
    const texto = await readFile(path.join(RAIZ, '_headers'), 'utf8');
    let dentro = false;
    for (const linea of texto.split(/\r?\n/)) {
      if (!linea.trim() || linea.trim().startsWith('#')) continue;
      if (!/^\s/.test(linea)) dentro = linea.trim() === '/*';
      else if (dentro) {
        const [nombre, ...valor] = linea.trim().split(':');
        resultado[nombre.trim()] = valor.join(':').trim();
      }
    }
  } catch {
    Object.assign(resultado, {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
  }
  return resultado;
}

const comunes = await cabeceras();

createServer(async (pedido, respuesta) => {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(pedido.url, 'http://x').pathname);
  } catch {
    respuesta.writeHead(400).end();
    return;
  }
  let archivo = path.resolve(RAIZ, `.${path.posix.normalize(ruta)}`);
  const relativa = path.relative(RAIZ, archivo);
  if (relativa.startsWith('..') || path.isAbsolute(relativa)) {
    respuesta.writeHead(403).end();
    return;
  }
  if (ruta === '/' || !path.extname(ruta)) archivo = path.join(RAIZ, 'index.html');
  try {
    const cuerpo = await readFile(archivo);
    respuesta.writeHead(200, {
      ...comunes,
      'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    respuesta.end(cuerpo);
  } catch {
    respuesta.writeHead(404, comunes).end('No encontrado');
  }
  // Solo en este PC (127.0.0.1): es una herramienta de prueba, no un servidor para la red.
}).listen(PUERTO, '127.0.0.1', () => console.log(`Stockeao web en http://localhost:${PUERTO}`));
