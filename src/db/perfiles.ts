import { randomUUID } from 'expo-crypto';

import { type Permiso, PERMISOS_INICIALES } from '@/features/permisos/catalogo';
import { normalizarNombre, ordenarPermisos } from '@/features/permisos/edicionPersonas';
import { parsearPermisos } from '@/features/permisos/permisos';
import { hashPin } from '@/lib/pin';

import type { BaseLocal } from './tipos';

export type Rol = 'dueno' | 'cajero';

export type Perfil = {
  id: string;
  negocio_id: string;
  nombre: string;
  /** 'dueno' (tiene todos los permisos) o 'cajero' (cualquier otra persona). */
  rol: Rol;
  /** Permisos de la persona. El dueño no usa la lista: tiene todos. */
  permisos: Permiso[];
  activo: boolean;
};

type FilaPerfil = Omit<Perfil, 'activo' | 'permisos'> & { activo: number; permisos: string };

const aPerfil = (fila: FilaPerfil): Perfil => ({
  ...fila,
  permisos: parsearPermisos(fila.permisos),
  activo: fila.activo === 1,
});

const COLUMNAS = 'id, negocio_id, nombre, rol, permisos, activo';

export async function listarPerfiles(
  db: BaseLocal,
  negocioId: string,
  opciones: { soloActivos?: boolean } = {},
): Promise<Perfil[]> {
  const filas = await db.getAllAsync<FilaPerfil>(
    `SELECT ${COLUMNAS} FROM perfiles
      WHERE negocio_id = ? AND eliminado = 0 ${opciones.soloActivos ? 'AND activo = 1' : ''}
      ORDER BY rol = 'cajero', nombre COLLATE NOCASE`,
    negocioId,
  );
  return filas.map(aPerfil);
}

export async function obtenerPerfil(db: BaseLocal, id: string): Promise<Perfil | null> {
  const fila = await db.getFirstAsync<FilaPerfil>(
    `SELECT ${COLUMNAS} FROM perfiles WHERE id = ? AND eliminado = 0`,
    id,
  );
  return fila ? aPerfil(fila) : null;
}

/** Persona nueva. Sin `permisos`, parte con PERMISOS_INICIALES; el dueño no usa la lista. */
export async function crearPerfil(
  db: BaseLocal,
  datos: {
    negocioId: string;
    nombre: string;
    rol: Rol;
    pin: string;
    permisos?: readonly Permiso[];
  },
): Promise<Perfil> {
  const id = randomUUID();
  const ahora = new Date().toISOString();
  const nombre = normalizarNombre(datos.nombre);
  const permisos =
    datos.rol === 'dueno' ? [] : ordenarPermisos(datos.permisos ?? PERMISOS_INICIALES);
  await db.runAsync(
    `INSERT INTO perfiles (id, negocio_id, nombre, rol, permisos, permisos_en, pin_hash, activo, creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
    id,
    datos.negocioId,
    nombre,
    datos.rol,
    JSON.stringify(permisos),
    ahora,
    await hashPin(id, datos.pin),
    ahora,
    ahora,
  );
  return { id, negocio_id: datos.negocioId, nombre, rol: datos.rol, permisos, activo: true };
}

/**
 * Cambia los permisos de una persona. permisos_en no se toca: es la versión que se bajó
 * del servidor, y el servidor rechaza la lista si mientras tanto otro equipo la cambió.
 * El dueño siempre tiene todos: no se toca.
 */
export async function cambiarPermisos(
  db: BaseLocal,
  perfilId: string,
  permisos: readonly Permiso[],
): Promise<void> {
  await db.runAsync(
    `UPDATE perfiles SET permisos = ?, actualizado_en = ?, pendiente = pendiente + 1
      WHERE id = ? AND rol <> 'dueno'`,
    JSON.stringify(ordenarPermisos(permisos)),
    new Date().toISOString(),
    perfilId,
  );
}

export async function cambiarNombre(db: BaseLocal, perfilId: string, nombre: string) {
  await actualizar(db, perfilId, 'nombre = ?', normalizarNombre(nombre));
}

export async function cambiarPin(db: BaseLocal, perfilId: string, pin: string): Promise<void> {
  await actualizar(db, perfilId, 'pin_hash = ?', await hashPin(perfilId, pin));
}

/** Activa o desactiva a una persona. El dueño no se desactiva. */
export async function cambiarActivo(
  db: BaseLocal,
  perfilId: string,
  activo: boolean,
): Promise<void> {
  await db.runAsync(
    `UPDATE perfiles SET activo = ?, actualizado_en = ?, pendiente = pendiente + 1
      WHERE id = ? AND rol <> 'dueno'`,
    activo ? 1 : 0,
    new Date().toISOString(),
    perfilId,
  );
}

export async function verificarPin(db: BaseLocal, perfilId: string, pin: string): Promise<boolean> {
  const fila = await db.getFirstAsync<{ pin_hash: string }>(
    'SELECT pin_hash FROM perfiles WHERE id = ? AND activo = 1 AND eliminado = 0',
    perfilId,
  );
  return fila !== null && fila.pin_hash === (await hashPin(perfilId, pin));
}

async function actualizar(db: BaseLocal, id: string, asignacion: string, valor: string | number) {
  await db.runAsync(
    `UPDATE perfiles SET ${asignacion}, actualizado_en = ?, pendiente = pendiente + 1 WHERE id = ?`,
    valor,
    new Date().toISOString(),
    id,
  );
}
