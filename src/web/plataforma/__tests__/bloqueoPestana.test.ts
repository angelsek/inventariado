import { crearBloqueoPestana, type Entorno } from '../bloqueoPestana';

type CanalPrueba = {
  onmessage: ((e: MessageEvent) => void) | null;
  cerrado: boolean;
  postMessage(data: unknown): void;
  close(): void;
};

/** Web Locks y BroadcastChannel en memoria, compartidos por varias "pestañas". */
function crearNavegador() {
  let dueno: object | null = null;
  const esperando: (() => void)[] = [];
  const canales: CanalPrueba[] = [];

  return (): Entorno & { soltar(): void } => {
    const mios: object[] = [];
    return {
      locks: {
        request(_nombre, opciones, tarea) {
          const tomar = () => {
            const lock = {};
            dueno = lock;
            mios.push(lock);
            void tarea(lock);
          };
          if (!dueno) tomar();
          else if (opciones.ifAvailable) void tarea(null);
          else {
            // Como el navegador: si se cancela la espera, la petición se rechaza.
            return new Promise<void>((resolve, reject) => {
              const enCola = () => {
                tomar();
                resolve();
              };
              esperando.push(enCola);
              opciones.signal?.addEventListener('abort', () => {
                esperando.splice(esperando.indexOf(enCola), 1);
                reject(new Error('AbortError'));
              });
            });
          }
          return Promise.resolve();
        },
      },
      crearCanal() {
        const canal: CanalPrueba = {
          onmessage: null,
          cerrado: false,
          postMessage(data) {
            for (const otro of canales) {
              if (otro !== canal && !otro.cerrado) otro.onmessage?.({ data } as MessageEvent);
            }
          },
          close() {
            canal.cerrado = true;
          },
        };
        canales.push(canal);
        return canal;
      },
      // Al recargarse la pestaña, el navegador libera su lock.
      soltar() {
        if (dueno && mios.includes(dueno)) {
          dueno = null;
          esperando.shift()?.();
        }
      },
    };
  };
}

it('la primera pestaña toma la base y la segunda queda bloqueada', async () => {
  const pestana = crearNavegador();
  const a = crearBloqueoPestana(pestana());
  const b = crearBloqueoPestana(pestana());
  expect(await a.tomar(jest.fn())).toBe(true);
  expect(await b.tomar(jest.fn())).toBe(false);
});

it('"Usar aquí" pide la base a la otra pestaña y la toma cuando esta la suelta', async () => {
  const pestana = crearNavegador();
  const entornoA = pestana();
  const a = crearBloqueoPestana(entornoA);
  const b = crearBloqueoPestana(pestana());
  const alPedirleA = jest.fn(() => entornoA.soltar());
  await a.tomar(alPedirleA);
  expect(await b.tomar(jest.fn())).toBe(false);

  expect(await b.quitar(jest.fn())).toBe(true);
  expect(alPedirleA).toHaveBeenCalledTimes(1);
});

it('si la otra pestaña no responde, "Usar aquí" se rinde después del plazo', async () => {
  jest.useFakeTimers();
  const pestana = crearNavegador();
  const a = crearBloqueoPestana(pestana());
  const b = crearBloqueoPestana(pestana());
  // La pestaña A está congelada: recibe el aviso pero nunca suelta la base.
  await a.tomar(jest.fn());

  const resultado = b.quitar(jest.fn(), 10_000);
  jest.advanceTimersByTime(10_000);
  await expect(resultado).resolves.toBe(false);
  jest.useRealTimers();
});
