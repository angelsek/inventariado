import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Parte de la API de expo-sqlite que usa el código de datos. Permite probar
 * ese código en Node con una base SQLite real (ver src/test/baseEnMemoria.ts).
 */
export type BaseLocal = Pick<
  SQLiteDatabase,
  'execAsync' | 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'withTransactionAsync'
>;
