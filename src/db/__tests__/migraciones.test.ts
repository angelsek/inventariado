import type { SQLiteDatabase } from 'expo-sqlite';

import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

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

describe('migración 8 (roles y permisos) sobre una base existente', () => {
  it('conserva los perfiles, agrega rol_id vacío y crea la tabla roles', async () => {
    const db = crearBaseEnMemoria();
    // Una base como la de la versión anterior: solo las 7 primeras migraciones.
    for (let i = 0; i < 7; i++) await db.execAsync(migraciones[i]);
    await db.execAsync('PRAGMA user_version = 7');
    await db.runAsync(
      `INSERT INTO perfiles (id, negocio_id, nombre, rol, pin_hash, activo, creado_en, actualizado_en, pendiente)
       VALUES ('p1', 'n1', 'Carla', 'cajero', 'h', 1, 'x', 'x', 0)`,
    );

    await migrarBaseDeDatos(db);

    const perfil = await db.getFirstAsync<Record<string, unknown>>(
      "SELECT nombre, rol, rol_id, pin_hash, pendiente FROM perfiles WHERE id = 'p1'",
    );
    expect(perfil).toEqual({
      nombre: 'Carla',
      rol: 'cajero',
      rol_id: null,
      pin_hash: 'h',
      pendiente: 0,
    });
    expect(await db.getAllAsync('SELECT * FROM roles')).toEqual([]);
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(migraciones.length);
    // Un segundo arranque no vuelve a migrar ni falla.
    await migrarBaseDeDatos(db);
  });
});
