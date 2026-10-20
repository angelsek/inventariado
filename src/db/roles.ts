import { randomUUID } from 'expo-crypto';

import type { Permiso, RolPredefinido } from '@/features/permisos/catalogo';
import {
  normalizarNombreRol,
  ordenarPermisos,
  validarNombreRol,
} from '@/features/permisos/edicionRoles';
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

/** Rol que se acaba de guardar en el equipo; sube al servidor al sincronizar. */
export async function crearRol(
  db: BaseLocal,
  datos: { negocioId: string; nombre: string; permisos: readonly Permiso[] },
): Promise<Rol> {
  const error = validarNombreRol(datos.nombre, await listarRoles(db, datos.negocioId), null);
  if (error) throw new Error(error);
  const rol: Rol = {
    id: randomUUID(),
    negocio_id: datos.negocioId,
    nombre: normalizarNombreRol(datos.nombre),
    permisos: ordenarPermisos(datos.permisos),
    predefinido: null,
    eliminado: false,
  };
  const ahora = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO roles (id, negocio_id, nombre, permisos, predefinido, creado_en, actualizado_en, eliminado, pendiente)
     VALUES (?, ?, ?, ?, NULL, ?, ?, 0, 1)`,
    rol.id,
    rol.negocio_id,
    rol.nombre,
    JSON.stringify(rol.permisos),
    ahora,
    ahora,
  );
  return rol;
}

/** Cambia el nombre o los permisos. Los predefinidos solo cambian sus permisos. */
export async function actualizarRol(
  db: BaseLocal,
  id: string,
  cambios: { nombre?: string; permisos?: readonly Permiso[] },
): Promise<void> {
  const rol = await obtenerRol(db, id);
  if (!rol || rol.eliminado) throw new Error('Rol no encontrado.');
  let nombre = rol.nombre;
  if (cambios.nombre !== undefined && normalizarNombreRol(cambios.nombre) !== rol.nombre) {
    if (rol.predefinido) throw new Error('Los roles predefinidos no se pueden renombrar.');
    const error = validarNombreRol(cambios.nombre, await listarRoles(db, rol.negocio_id), id);
    if (error) throw new Error(error);
    nombre = normalizarNombreRol(cambios.nombre);
  }
  const permisos = cambios.permisos ? ordenarPermisos(cambios.permisos) : rol.permisos;
  await db.runAsync(
    `UPDATE roles SET nombre = ?, permisos = ?, actualizado_en = ?, pendiente = pendiente + 1
      WHERE id = ?`,
    nombre,
    JSON.stringify(permisos),
    new Date().toISOString(),
    id,
  );
}

/**
 * Elimina un rol propio sin personas. Cuenta también a las personas desactivadas,
 * igual que el servidor, porque al reactivarlas volverían a usar el rol.
 */
export async function eliminarRol(db: BaseLocal, id: string): Promise<void> {
  const rol = await obtenerRol(db, id);
  if (!rol || rol.eliminado) throw new Error('Rol no encontrado.');
  if (rol.predefinido) throw new Error('Los roles predefinidos no se pueden eliminar.');
  const conRol = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM perfiles WHERE rol_id = ? AND eliminado = 0',
    id,
  );
  if ((conRol?.n ?? 0) > 0) throw new Error('Cambia de rol a las personas antes de eliminarlo.');
  await db.runAsync(
    `UPDATE roles SET eliminado = 1, actualizado_en = ?, pendiente = pendiente + 1 WHERE id = ?`,
    new Date().toISOString(),
    id,
  );
}

/**
 * Personas (sin el dueño) por id de rol vigente. Quien no tiene rol, o tiene uno
 * eliminado, cuenta como Cajero, igual que en `permisosDePerfil`.
 */
export async function contarPersonasPorRol(
  db: BaseLocal,
  negocioId: string,
): Promise<Record<string, number>> {
  const roles = await listarRoles(db, negocioId);
  const cajero = roles.find((r) => r.predefinido === 'cajero');
  const filas = await db.getAllAsync<{ rol_id: string | null; n: number }>(
    `SELECT rol_id, COUNT(*) AS n FROM perfiles
      WHERE negocio_id = ? AND eliminado = 0 AND rol <> 'dueno' GROUP BY rol_id`,
    negocioId,
  );
  const cuenta: Record<string, number> = {};
  for (const { rol_id, n } of filas) {
    const id = roles.some((r) => r.id === rol_id) ? rol_id! : cajero?.id;
    if (id) cuenta[id] = (cuenta[id] ?? 0) + n;
  }
  return cuenta;
}
