import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import type { ReactNode } from 'react';

import { migrarBaseDeDatos, NOMBRE_BASE_DE_DATOS } from './migraciones';
import type { BaseLocal } from './tipos';

/**
 * Abre la base local y la migra antes de mostrar la app. En el teléfono usa
 * expo-sqlite (en la web, su versión wasm con OPFS; ver proveedor.web.tsx).
 */
export function ProveedorBase({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={NOMBRE_BASE_DE_DATOS} onInit={migrarBaseDeDatos}>
      {children}
    </SQLiteProvider>
  );
}

/** Base local del equipo. Solo expone la parte de la API que funciona en todas las plataformas. */
export function useBase(): BaseLocal {
  return useSQLiteContext();
}
