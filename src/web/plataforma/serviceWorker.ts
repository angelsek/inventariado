import { create } from 'zustand';

/**
 * Service worker de la web (dist/sw.js, lo genera scripts/construir-web.mjs): guarda la app
 * para que abra sin internet. Una versión nueva queda esperando hasta que la persona toque
 * "Actualizar"; así nunca cambia la app en medio de una venta.
 */
type EstadoVersion = {
  /** Hay una versión nueva descargada, lista para activarse. */
  hayNueva: boolean;
  actualizar(): void;
};

let enEspera: ServiceWorker | null = null;

export const useVersionWeb = create<EstadoVersion>(() => ({
  hayNueva: false,
  actualizar: () => {
    if (!enEspera) return;
    // Al tomar el control la versión nueva, se recarga la página (ver registrarServiceWorker).
    enEspera.postMessage({ type: 'SKIP_WAITING' });
  },
}));

function avisarNueva(trabajador: ServiceWorker) {
  enEspera = trabajador;
  useVersionWeb.setState({ hayNueva: true });
}

/** Registra el service worker (solo en producción: en desarrollo guardaría versiones viejas). */
export function registrarServiceWorker() {
  if (__DEV__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return;
    recargando = true;
    location.reload();
  });

  navigator.serviceWorker
    .register('/sw.js')
    .then((registro) => {
      if (registro.waiting && navigator.serviceWorker.controller) avisarNueva(registro.waiting);
      registro.addEventListener('updatefound', () => {
        const nuevo = registro.installing;
        nuevo?.addEventListener('statechange', () => {
          // Con un controlador previo es una actualización; sin él, es la primera instalación.
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            avisarNueva(nuevo);
          }
        });
      });
      // Revisa si hay versión nueva cada hora (la app suele quedar abierta todo el día).
      setInterval(() => void registro.update().catch(() => {}), 60 * 60 * 1000);
    })
    .catch(() => {
      // Sin service worker la web funciona igual, solo que no abre sin internet.
    });
}
