/**
 * Una sola pestaña puede tener abierta la base local: SQLite en el navegador (OPFS) no
 * admite dos conexiones al mismo archivo. Se usa un Web Lock que dura mientras la pestaña
 * tenga la base; otra pestaña puede pedirlo con "Usar aquí" (por BroadcastChannel) y la
 * que lo tenía se recarga sin base, lo que cierra su conexión.
 */

export const NOMBRE_BLOQUEO = 'stockeao-base';
const CANAL = 'stockeao-pestanas';
const MENSAJE_CEDER = 'ceder';

type Locks = {
  request(
    nombre: string,
    opciones: { ifAvailable?: boolean },
    tarea: (lock: unknown) => Promise<void> | void,
  ): Promise<unknown>;
};
type Canal = {
  postMessage(mensaje: unknown): void;
  onmessage: ((evento: MessageEvent) => void) | null;
  close(): void;
};

export type Entorno = { locks: Locks; crearCanal: (nombre: string) => Canal };

export function crearBloqueoPestana({ locks, crearCanal }: Entorno) {
  let canal: Canal | null = null;

  /** Mantiene el bloqueo hasta que se cierre la pestaña. */
  const retener = () => new Promise<void>(() => {});

  /** Avisa por `alPedirlo` cuando otra pestaña pide la base (esta debe soltarla). */
  const escuchar = (alPedirlo: () => void) => {
    canal = crearCanal(CANAL);
    canal.onmessage = ({ data }) => {
      if (data === MENSAJE_CEDER) alPedirlo();
    };
  };

  return {
    /** true si esta pestaña quedó con la base; false si ya la tiene otra. */
    tomar(alPedirlo: () => void): Promise<boolean> {
      return new Promise((resolve) => {
        void locks.request(NOMBRE_BLOQUEO, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return;
          }
          escuchar(alPedirlo);
          resolve(true);
          return retener();
        });
      });
    },
    /** Pide la base a la pestaña que la tiene y espera a que la suelte. */
    quitar(alPedirlo: () => void): Promise<void> {
      const aviso = crearCanal(CANAL);
      aviso.postMessage(MENSAJE_CEDER);
      aviso.close();
      return new Promise((resolve) => {
        void locks.request(NOMBRE_BLOQUEO, {}, () => {
          escuchar(alPedirlo);
          resolve();
          return retener();
        });
      });
    },
    soltar() {
      canal?.close();
      canal = null;
    },
  };
}
