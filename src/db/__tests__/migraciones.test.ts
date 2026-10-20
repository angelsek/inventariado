import type { SQLiteDatabase } from 'expo-sqlite';

import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

import { migraciones, migrarBaseDeDatos } from '../migraciones';
import type { BaseLocal } from '../tipos';

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

describe('migración 9 (permisos por persona) sobre una base con roles locales', () => {
  const AHORA = '2026-10-19T10:00:00.000Z';

  /** Una base como la de la versión con roles: las 8 primeras migraciones. */
  async function baseV8() {
    const db = crearBaseEnMemoria();
    for (let i = 0; i < 8; i++) await db.execAsync(migraciones[i]);
    await db.execAsync('PRAGMA user_version = 8');
    return db;
  }
  const rol = (
    db: BaseLocal,
    id: string,
    permisos: string,
    predefinido: string | null,
    { eliminado = 0, negocio = 'n1' } = {},
  ) =>
    db.runAsync(
      `INSERT INTO roles (id, negocio_id, nombre, permisos, predefinido, creado_en, actualizado_en, eliminado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      negocio,
      id,
      permisos,
      predefinido,
      AHORA,
      AHORA,
      eliminado,
    );
  const perfil = (
    db: BaseLocal,
    id: string,
    rolTexto: string,
    rolId: string | null,
    { negocio = 'n1', pendiente = 0 } = {},
  ) =>
    db.runAsync(
      `INSERT INTO perfiles (id, negocio_id, nombre, rol, rol_id, pin_hash, activo, creado_en, actualizado_en, pendiente)
       VALUES (?, ?, ?, ?, ?, 'h', 1, ?, ?, ?)`,
      id,
      negocio,
      id,
      rolTexto,
      rolId,
      AHORA,
      AHORA,
      pendiente,
    );
  const permisosDe = async (db: BaseLocal, id: string) =>
    JSON.parse(
      (await db.getFirstAsync<{ permisos: string }>(
        'SELECT permisos FROM perfiles WHERE id = ?',
        id,
      ))!.permisos,
    );

  it('cada persona hereda los permisos de su rol', async () => {
    const db = await baseV8();
    await rol(db, 'r-bod', '["productos_editar","mercaderia","stock"]', 'bodeguero');
    await rol(db, 'r-caj', '["vender","caja"]', 'cajero');
    await perfil(db, 'beto', 'cajero', 'r-bod');
    await migrarBaseDeDatos(db);

    expect(await permisosDe(db, 'beto')).toEqual(['productos_editar', 'mercaderia', 'stock']);
  });

  it('con el rol eliminado, o sin rol, usa los permisos del Cajero del negocio', async () => {
    const db = await baseV8();
    await rol(db, 'r-caj', '["vender","reportes"]', 'cajero');
    await rol(db, 'r-borrado', '["usuarios"]', null, { eliminado: 1 });
    await perfil(db, 'rosa', 'cajero', 'r-borrado');
    await perfil(db, 'sin-rol', 'cajero', null);
    await perfil(db, 'rol-que-no-existe', 'cajero', 'r-fantasma');
    await migrarBaseDeDatos(db);

    for (const id of ['rosa', 'sin-rol', 'rol-que-no-existe']) {
      expect(await permisosDe(db, id)).toEqual(['vender', 'reportes']);
    }
  });

  it('cada negocio usa el Cajero propio, no el de otro', async () => {
    const db = await baseV8();
    await rol(db, 'r-caj-1', '["vender"]', 'cajero', { negocio: 'n1' });
    await rol(db, 'r-caj-2', '["stock"]', 'cajero', { negocio: 'n2' });
    await perfil(db, 'p1', 'cajero', null, { negocio: 'n1' });
    await perfil(db, 'p2', 'cajero', null, { negocio: 'n2' });
    await migrarBaseDeDatos(db);

    expect(await permisosDe(db, 'p1')).toEqual(['vender']);
    expect(await permisosDe(db, 'p2')).toEqual(['stock']);
  });

  it('sin roles en la base, la persona queda con los 4 permisos de cajero de antes', async () => {
    const db = await baseV8();
    await perfil(db, 'carla', 'cajero', null);
    await migrarBaseDeDatos(db);

    expect(await permisosDe(db, 'carla')).toEqual(['vender', 'ventas_ver', 'caja', 'fiado']);
  });

  it('el dueño queda con lista vacía aunque tenga rol', async () => {
    const db = await baseV8();
    await rol(db, 'r-adm', '["vender","usuarios"]', 'administrador');
    await perfil(db, 'ana', 'dueno', 'r-adm');
    await migrarBaseDeDatos(db);

    expect(await permisosDe(db, 'ana')).toEqual([]);
  });

  it('borra el cursor de perfiles (para bajarlos de nuevo) y no los demás', async () => {
    const db = await baseV8();
    await db.runAsync(
      "INSERT INTO sync_cursores (tabla, cursor) VALUES ('perfiles', '55'), ('productos', '77'), ('roles', '9')",
    );
    await migrarBaseDeDatos(db);

    const cursores = await db.getAllAsync<{ tabla: string; cursor: string }>(
      'SELECT tabla, cursor FROM sync_cursores ORDER BY tabla',
    );
    expect(cursores).toEqual([
      { tabla: 'productos', cursor: '77' },
      { tabla: 'roles', cursor: '9' },
    ]);
  });

  it('no cambia pendiente ni los demás datos del perfil', async () => {
    const db = await baseV8();
    await perfil(db, 'carla', 'cajero', null, { pendiente: 3 });
    await perfil(db, 'luis', 'cajero', null, { pendiente: 0 });
    await migrarBaseDeDatos(db);

    const filas = await db.getAllAsync<Record<string, unknown>>(
      'SELECT id, rol, pin_hash, activo, pendiente, actualizado_en FROM perfiles ORDER BY id',
    );
    expect(filas).toEqual([
      { id: 'carla', rol: 'cajero', pin_hash: 'h', activo: 1, pendiente: 3, actualizado_en: AHORA },
      { id: 'luis', rol: 'cajero', pin_hash: 'h', activo: 1, pendiente: 0, actualizado_en: AHORA },
    ]);
  });

  it('un segundo arranque no vuelve a migrar ni pisa permisos editados', async () => {
    const db = await baseV8();
    await perfil(db, 'carla', 'cajero', null);
    await migrarBaseDeDatos(db);
    await db.runAsync("UPDATE perfiles SET permisos = '[\"stock\"]' WHERE id = 'carla'");
    await migrarBaseDeDatos(db);

    expect(await permisosDe(db, 'carla')).toEqual(['stock']);
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(version?.user_version).toBe(migraciones.length);
  });
});
