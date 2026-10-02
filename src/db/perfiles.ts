import { randomUUID } from 'expo-crypto';

import { hashPin } from '@/lib/pin';

import type { BaseLocal } from './tipos';

export type Rol = 'dueno' | 'cajero';

export type Perfil = {
  id: string;
  negocio_id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
};

type FilaPerfil = Omit<Perfil, 'activo'> & { activo: number };

const aPerfil = (fila: FilaPerfil): Perfil => ({ ...fila, activo: fila.activo === 1 });

export async function listarPerfiles(
  db: BaseLocal,
  negocioId: string,
  opciones: { soloActivos?: boolean } = {},
): Promise<Perfil[]> {
  const filas = await db.getAllAsync<FilaPerfil>(
    `SELECT id, negocio_id, nombre, rol, activo FROM perfiles
      WHERE negocio_id = ? AND eliminado = 0 ${opciones.soloActivos ? 'AND activo = 1' : ''}
      ORDER BY rol = 'cajero', nombre COLLATE NOCASE`,
    negocioId,
  );
  return filas.map(aPerfil);
}

export async function obtenerPerfil(db: BaseLocal, id: string): Promise<Perfil | null> {
  const fila = await db.getFirstAsync<FilaPerfil>(
    'SELECT id, negocio_id, nombre, rol, activo FROM perfiles WHERE id = ? AND eliminado = 0',
    id,
  );
  return fila ? aPerfil(fila) : null;
}

export async function crearPerfil(
  db: BaseLocal,
  datos: { negocioId: string; nombre: string; rol: Rol; pin: string },
): Promise<Perfil> {
  const id = randomUUID();
  const ahora = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO perfiles (id, negocio_id, nombre, rol, pin_hash, activo, creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1)`,
    id,
    datos.negocioId,
    datos.nombre.trim(),
    datos.rol,
    await hashPin(id, datos.pin),
    ahora,
    ahora,
  );
  return {
    id,
    negocio_id: datos.negocioId,
    nombre: datos.nombre.trim(),
    rol: datos.rol,
    activo: true,
  };
}

export async function cambiarPin(db: BaseLocal, perfilId: string, pin: string): Promise<void> {
  await actualizar(db, perfilId, 'pin_hash = ?', await hashPin(perfilId, pin));
}

export async function cambiarActivo(
  db: BaseLocal,
  perfilId: string,
  activo: boolean,
): Promise<void> {
  await actualizar(db, perfilId, 'activo = ?', activo ? 1 : 0);
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
