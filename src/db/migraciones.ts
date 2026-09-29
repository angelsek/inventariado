import type { BaseLocal } from './tipos';

export const NOMBRE_BASE_DE_DATOS = 'inventariado.db';

/**
 * Migraciones de la base local. Cada entrada lleva la base de la versión
 * `indice` a la `indice + 1`. Nunca se modifica una migración ya publicada:
 * los cambios nuevos se agregan al final.
 */
export const migraciones: string[] = [
  // 1: tabla de ajustes clave/valor (datos del dispositivo, preferencias).
  `CREATE TABLE ajustes (
     clave TEXT PRIMARY KEY NOT NULL,
     valor TEXT NOT NULL
   );`,

  // 2 (fase 1): negocio, perfiles y dispositivos sincronizados con Supabase.
  // `pendiente` > 0 indica cambios locales aún no subidos (ver src/sync/motor.ts).
  `CREATE TABLE negocios (
     id TEXT PRIMARY KEY NOT NULL,
     nombre TEXT NOT NULL,
     rut TEXT,
     direccion TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE perfiles (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     nombre TEXT NOT NULL,
     rol TEXT NOT NULL,
     pin_hash TEXT NOT NULL,
     activo INTEGER NOT NULL DEFAULT 1,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE dispositivos (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     nombre TEXT NOT NULL,
     ultimo_sync TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE sync_cursores (
     tabla TEXT PRIMARY KEY NOT NULL,
     cursor TEXT NOT NULL
   );`,
];

/** Aplica las migraciones pendientes usando PRAGMA user_version. */
export async function migrarBaseDeDatos(db: BaseLocal): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const versionActual = fila?.user_version ?? 0;

  for (let version = versionActual; version < migraciones.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(migraciones[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
