import { randomUUID } from 'expo-crypto';

import type { BaseLocal } from './tipos';

export type Categoria = { id: string; nombre: string };

export const CATEGORIAS_SUGERIDAS = [
  'Bebidas',
  'Cervezas',
  'Vinos',
  'Destilados',
  'Snacks',
  'Abarrotes',
  'Lácteos',
  'Cigarros',
  'Limpieza',
  'Otros',
];

export async function listarCategorias(db: BaseLocal, negocioId: string): Promise<Categoria[]> {
  return db.getAllAsync<Categoria>(
    `SELECT id, nombre FROM categorias WHERE negocio_id = ? AND eliminado = 0
      ORDER BY nombre COLLATE NOCASE`,
    negocioId,
  );
}

/** Crea la categoría o devuelve la existente con el mismo nombre (sin distinguir mayúsculas). */
export async function crearCategoria(
  db: BaseLocal,
  negocioId: string,
  nombre: string,
): Promise<Categoria> {
  const limpio = nombre.trim();
  const existente = await db.getFirstAsync<Categoria>(
    `SELECT id, nombre FROM categorias
      WHERE negocio_id = ? AND eliminado = 0 AND nombre = ? COLLATE NOCASE`,
    negocioId,
    limpio,
  );
  if (existente) return existente;

  const id = randomUUID();
  const ahora = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO categorias (id, negocio_id, nombre, creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, 1)`,
    id,
    negocioId,
    limpio,
    ahora,
    ahora,
  );
  return { id, nombre: limpio };
}

export async function renombrarCategoria(db: BaseLocal, id: string, nombre: string): Promise<void> {
  await db.runAsync(
    `UPDATE categorias SET nombre = ?, actualizado_en = ?, pendiente = pendiente + 1 WHERE id = ?`,
    nombre.trim(),
    new Date().toISOString(),
    id,
  );
}

/** Elimina la categoría; sus productos quedan "sin categoría". */
export async function eliminarCategoria(db: BaseLocal, id: string): Promise<void> {
  const ahora = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE categorias SET eliminado = 1, actualizado_en = ?, pendiente = pendiente + 1
        WHERE id = ?`,
      ahora,
      id,
    );
    await db.runAsync(
      `UPDATE productos SET categoria_id = NULL, actualizado_en = ?, pendiente = pendiente + 1
        WHERE categoria_id = ?`,
      ahora,
      id,
    );
  });
}
