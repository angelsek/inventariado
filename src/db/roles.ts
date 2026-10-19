import type { Permiso, RolPredefinido } from '@/features/permisos/catalogo';
import { parsearPermisos } from '@/features/permisos/permisos';

import type { BaseLocal } from './tipos';

/** Rol del negocio con sus permisos. Los predefinidos los crea el servidor. */
export type Rol = {
  id: string;
  negocio_id: string;
  nombre: string;
  permisos: Permiso[];
  predefinido: RolPredefinido | null;
  eliminado: boolean;
};

type FilaRol = Omit<Rol, 'permisos' | 'eliminado'> & { permisos: string; eliminado: number };

const aRol = (fila: FilaRol): Rol => ({
  ...fila,
  permisos: parsearPermisos(fila.permisos),
  eliminado: fila.eliminado === 1,
});

const COLUMNAS = 'id, negocio_id, nombre, permisos, predefinido, eliminado';

// Orden fijo: primero los predefinidos (Administrador, Cajero, Bodeguero), luego el resto.
const ORDEN = `CASE predefinido WHEN 'administrador' THEN 0 WHEN 'cajero' THEN 1
  WHEN 'bodeguero' THEN 2 ELSE 3 END, nombre COLLATE NOCASE`;

export async function listarRoles(db: BaseLocal, negocioId: string): Promise<Rol[]> {
  const filas = await db.getAllAsync<FilaRol>(
    `SELECT ${COLUMNAS} FROM roles WHERE negocio_id = ? AND eliminado = 0 ORDER BY ${ORDEN}`,
    negocioId,
  );
  return filas.map(aRol);
}

/** Incluye roles eliminados: quien lo tenía queda con los permisos del Cajero. */
export async function obtenerRol(db: BaseLocal, id: string): Promise<Rol | null> {
  const fila = await db.getFirstAsync<FilaRol>(`SELECT ${COLUMNAS} FROM roles WHERE id = ?`, id);
  return fila ? aRol(fila) : null;
}
