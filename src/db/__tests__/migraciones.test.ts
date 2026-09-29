import type { SQLiteDatabase } from 'expo-sqlite';

import { migraciones, migrarBaseDeDatos } from '../migraciones';

/** Base falsa que registra las sentencias ejecutadas. */
function crearBaseFalsa(versionInicial: number) {
  const sentencias: string[] = [];
  let version = versionInicial;

  const db = {
    execAsync: jest.fn(async (sql: string) => {
      sentencias.push(sql);
      const coincide = sql.match(/PRAGMA user_version = (\d+)/);
      if (coincide) version = Number(coincide[1]);
    }),
    getFirstAsync: jest.fn(async () => ({ user_version: version })),
    withTransactionAsync: jest.fn(async (tarea: () => Promise<void>) => tarea()),
  };

  return { db: db as unknown as SQLiteDatabase, sentencias, version: () => version };
}

describe('migrarBaseDeDatos', () => {
  it('aplica todas las migraciones en una base nueva', async () => {
    const base = crearBaseFalsa(0);
    await migrarBaseDeDatos(base.db);

    expect(base.version()).toBe(migraciones.length);
    for (const migracion of migraciones) {
      expect(base.sentencias).toContain(migracion);
    }
  });

  it('no vuelve a aplicar migraciones ya ejecutadas', async () => {
    const base = crearBaseFalsa(migraciones.length);
    await migrarBaseDeDatos(base.db);

    expect(base.version()).toBe(migraciones.length);
    for (const migracion of migraciones) {
      expect(base.sentencias).not.toContain(migracion);
    }
  });
});
