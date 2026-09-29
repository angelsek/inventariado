import type { BaseLocal } from '@/db/tipos';

type Parametros = (string | number | null)[];

// Tipos mínimos de node:sqlite (Node 22+), para no cargar @types/node en la app.
type SentenciaNode = {
  run(...params: Parametros): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: Parametros): unknown[];
  get(...params: Parametros): unknown;
};
type DatabaseSyncNode = new (ruta: string) => {
  exec(sql: string): void;
  prepare(sql: string): SentenciaNode;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: DatabaseSyncNode };

/** Base SQLite en memoria con la misma interfaz que expo-sqlite, para pruebas. */
export function crearBaseEnMemoria(): BaseLocal {
  const db = new DatabaseSync(':memory:');
  const aplanar = (params: unknown[]): Parametros =>
    (params.length === 1 && Array.isArray(params[0]) ? params[0] : params) as Parametros;

  const base = {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, ...params: unknown[]) {
      const r = db.prepare(sql).run(...aplanar(params));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async getAllAsync(sql: string, ...params: unknown[]) {
      return db.prepare(sql).all(...aplanar(params));
    },
    async getFirstAsync(sql: string, ...params: unknown[]) {
      return db.prepare(sql).get(...aplanar(params)) ?? null;
    },
    async withTransactionAsync(tarea: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await tarea();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };

  return base as unknown as BaseLocal;
}
