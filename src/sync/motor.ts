import type { BaseLocal } from '@/db/tipos';

import { TABLAS_SYNC, type TablaSync } from './tablas';

export type Fila = Record<string, unknown>;

/** Operaciones contra el servidor. La implementación real está en ./remotoSupabase.ts. */
export interface Remoto {
  subir(tabla: string, filas: Fila[]): Promise<void>;
  descargar(
    tabla: string,
    negocioId: string,
    cursor: string | null,
  ): Promise<{ cursor: string; filas: Fila[] }>;
}

export type ResultadoSync = { subidas: number; descargadas: number };

/**
 * Sincroniza la base local con el servidor:
 *   1. Sube las filas con cambios locales (`pendiente` > 0).
 *   2. Descarga lo que cambió en el servidor desde el último cursor.
 *
 * Cada escritura local incrementa `pendiente`. Al subir, solo se limpia si no
 * cambió mientras tanto, así una edición hecha durante la subida no se pierde.
 * Al descargar, las filas con cambios locales pendientes no se sobrescriben:
 * se suben en la próxima sincronización (gana la última escritura).
 */
export async function sincronizar(
  db: BaseLocal,
  remoto: Remoto,
  negocioId: string,
  tablas: readonly TablaSync[] = TABLAS_SYNC,
): Promise<ResultadoSync> {
  let subidas = 0;
  let descargadas = 0;

  for (const tabla of tablas) {
    subidas += await subirTabla(db, remoto, tabla);
  }
  for (const tabla of tablas) {
    descargadas += await descargarTabla(db, remoto, tabla, negocioId);
  }

  return { subidas, descargadas };
}

/** Cantidad de filas con cambios locales sin subir. */
export async function contarPendientes(
  db: BaseLocal,
  tablas: readonly TablaSync[] = TABLAS_SYNC,
): Promise<number> {
  let total = 0;
  for (const tabla of tablas) {
    const fila = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${tabla.nombre} WHERE pendiente > 0`,
    );
    total += fila?.n ?? 0;
  }
  return total;
}

async function subirTabla(db: BaseLocal, remoto: Remoto, tabla: TablaSync): Promise<number> {
  const locales = await db.getAllAsync<Fila & { pendiente: number }>(
    `SELECT ${tabla.columnas.join(', ')}, pendiente FROM ${tabla.nombre} WHERE pendiente > 0`,
  );
  if (locales.length === 0) return 0;

  await remoto.subir(
    tabla.nombre,
    locales.map((fila) => aServidor(tabla, fila)),
  );

  await db.withTransactionAsync(async () => {
    for (const fila of locales) {
      await db.runAsync(
        `UPDATE ${tabla.nombre} SET pendiente = 0 WHERE id = ? AND pendiente = ?`,
        fila.id as string,
        fila.pendiente,
      );
    }
  });
  return locales.length;
}

async function descargarTabla(
  db: BaseLocal,
  remoto: Remoto,
  tabla: TablaSync,
  negocioId: string,
): Promise<number> {
  const guardado = await db.getFirstAsync<{ cursor: string }>(
    'SELECT cursor FROM sync_cursores WHERE tabla = ?',
    tabla.nombre,
  );
  const { cursor, filas } = await remoto.descargar(
    tabla.nombre,
    negocioId,
    guardado?.cursor ?? null,
  );

  const columnas = tabla.columnas;
  const actualizar = columnas
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  const sql =
    `INSERT INTO ${tabla.nombre} (${columnas.join(', ')}) ` +
    `VALUES (${columnas.map(() => '?').join(', ')}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${actualizar} WHERE ${tabla.nombre}.pendiente = 0`;

  await db.withTransactionAsync(async () => {
    for (const fila of filas) {
      await db.runAsync(sql, aLocal(tabla, fila));
    }
    await db.runAsync(
      'INSERT INTO sync_cursores (tabla, cursor) VALUES (?, ?) ' +
        'ON CONFLICT(tabla) DO UPDATE SET cursor = excluded.cursor',
      tabla.nombre,
      cursor,
    );
  });
  return filas.length;
}

function aServidor(tabla: TablaSync, fila: Fila): Fila {
  const resultado: Fila = {};
  for (const columna of tabla.columnas) {
    const valor = fila[columna];
    resultado[columna] = tabla.booleanas.includes(columna) ? Boolean(valor) : valor;
  }
  return resultado;
}

function aLocal(tabla: TablaSync, fila: Fila): (string | number | null)[] {
  return tabla.columnas.map((columna) => {
    const valor = fila[columna];
    if (valor === undefined || valor === null) return null;
    if (tabla.booleanas.includes(columna)) return valor ? 1 : 0;
    return valor as string | number;
  });
}
