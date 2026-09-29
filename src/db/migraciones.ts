import type { SQLiteDatabase } from 'expo-sqlite';

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
];

/** Aplica las migraciones pendientes usando PRAGMA user_version. */
export async function migrarBaseDeDatos(db: SQLiteDatabase): Promise<void> {
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
