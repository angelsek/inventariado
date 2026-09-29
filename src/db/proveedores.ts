import { randomUUID } from 'expo-crypto';

import type { BaseLocal } from './tipos';

export type Proveedor = { id: string; nombre: string; rut: string | null; telefono: string | null };

export async function listarProveedores(db: BaseLocal, negocioId: string): Promise<Proveedor[]> {
  return db.getAllAsync<Proveedor>(
    `SELECT id, nombre, rut, telefono FROM proveedores
      WHERE negocio_id = ? AND eliminado = 0 ORDER BY nombre COLLATE NOCASE`,
    negocioId,
  );
}

export async function guardarProveedor(
  db: BaseLocal,
  negocioId: string,
  datos: { id?: string; nombre: string; rut: string; telefono: string },
): Promise<Proveedor> {
  const ahora = new Date().toISOString();
  const proveedor = {
    id: datos.id ?? randomUUID(),
    nombre: datos.nombre.trim(),
    rut: datos.rut.trim() || null,
    telefono: datos.telefono.trim() || null,
  };
  if (datos.id) {
    await db.runAsync(
      `UPDATE proveedores SET nombre = ?, rut = ?, telefono = ?, actualizado_en = ?,
         pendiente = pendiente + 1 WHERE id = ?`,
      proveedor.nombre,
      proveedor.rut,
      proveedor.telefono,
      ahora,
      proveedor.id,
    );
  } else {
    await db.runAsync(
      `INSERT INTO proveedores (id, negocio_id, nombre, rut, telefono, creado_en, actualizado_en, pendiente)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      proveedor.id,
      negocioId,
      proveedor.nombre,
      proveedor.rut,
      proveedor.telefono,
      ahora,
      ahora,
    );
  }
  return proveedor;
}

export async function eliminarProveedor(db: BaseLocal, id: string): Promise<void> {
  await db.runAsync(
    `UPDATE proveedores SET eliminado = 1, actualizado_en = ?, pendiente = pendiente + 1 WHERE id = ?`,
    new Date().toISOString(),
    id,
  );
}
