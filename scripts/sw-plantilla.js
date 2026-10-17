/* global __ARCHIVOS__ */
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

// Si el servidor redirige (p. ej. /index.html → /), el navegador no acepta esa respuesta para
// abrir la app: se guarda una copia sin la marca de "redirigida".
async function sinRedireccion(respuesta) {
  if (!respuesta.redirected) return respuesta;
  return new Response(await respuesta.blob(), {
    status: respuesta.status,
    statusText: respuesta.statusText,
    headers: respuesta.headers,
  });
}

async function guardarTodo() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    ARCHIVOS.map(async (url) => {
      const respuesta = await fetch(new Request(url, { cache: 'reload' }));
      if (!respuesta.ok) throw new Error(`No se pudo guardar ${url} (${respuesta.status}).`);
      await cache.put(url, await sinRedireccion(respuesta));
    }),
  );
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(guardarTodo());
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
