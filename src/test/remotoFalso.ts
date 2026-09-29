import type { Fila, Remoto } from '@/sync/motor';

/**
 * Servidor en memoria que imita a Supabase: cada escritura recibe un número
 * de transacción creciente y la descarga devuelve lo escrito desde el cursor.
 */
export function crearRemotoFalso() {
  let transaccion = 1;
  const tablas = new Map<string, Map<string, { fila: Fila; xid: number }>>();
  const tabla = (nombre: string) => {
    if (!tablas.has(nombre)) tablas.set(nombre, new Map());
    return tablas.get(nombre)!;
  };

  const remoto: Remoto & {
    filas(tabla: string): Fila[];
    escribir(tabla: string, fila: Fila): void;
    fallar: boolean;
  } = {
    fallar: false,
    async subir(nombre, filas) {
      if (remoto.fallar) throw new Error('sin conexión');
      const xid = transaccion++;
      for (const fila of filas) {
        tabla(nombre).set(fila.id as string, {
          fila: { ...fila, actualizado_en: new Date().toISOString() },
          xid,
        });
      }
    },
    async descargar(nombre, negocioId, cursor) {
      if (remoto.fallar) throw new Error('sin conexión');
      const desde = cursor === null ? 0 : Number(cursor);
      const filas = [...tabla(nombre).values()]
        .filter(({ fila, xid }) => {
          const negocio = nombre === 'negocios' ? fila.id : fila.negocio_id;
          return negocio === negocioId && xid >= desde;
        })
        .sort((a, b) => a.xid - b.xid)
        .map(({ fila }) => fila);
      return { cursor: String(transaccion), filas };
    },
    filas: (nombre) => [...tabla(nombre).values()].map(({ fila }) => fila),
    escribir(nombre, fila) {
      tabla(nombre).set(fila.id as string, { fila, xid: transaccion++ });
    },
  };
  return remoto;
}
