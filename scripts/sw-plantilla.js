/* global self, caches, fetch, Request, URL */
// Service worker de la versión web (PC). Plantilla: scripts/construir-web.mjs reemplaza
// __VERSION__ y __ARCHIVOS__ y la escribe en dist/sw.js. Ver docs/WEB.md.
//
// - Al instalarse guarda todos los archivos de la app (para abrir sin internet).
// - Cualquier ruta de la app abre index.html desde la caché (Expo Router decide la pantalla).
// - Una versión nueva queda esperando hasta que la app envíe SKIP_WAITING ("Actualizar").
// - Solo responde pedidos GET del propio sitio: Supabase y lo demás van directo a la red.
const VERSION = '__VERSION__';
const ARCHIVOS = __ARCHIVOS__;
const CACHE = `stockeao-${VERSION}`;

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ARCHIVOS.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith('stockeao-') && nombre !== CACHE)
            .map((nombre) => caches.delete(nombre)),
        ),
      ),
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (pedido.mode === 'navigate') {
    evento.respondWith(
      caches
        .match('/index.html', { cacheName: CACHE })
        .then((guardada) => guardada || fetch(pedido)),
    );
    return;
  }
  evento.respondWith(
    caches.match(url.pathname, { cacheName: CACHE }).then((guardada) => guardada || fetch(pedido)),
  );
});
