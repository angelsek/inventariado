import { randomUUID } from 'expo-crypto';

import type { BaseLocal } from './tipos';

export type Categoria = {
  id: string;
  nombre: string;
  /** Sus productos son alcohol: al venderlos se pide confirmar la mayoría de edad. */
  alcohol: boolean;
};

/** Categorías sugeridas que se crean marcadas como alcohol. */
export const CATEGORIAS_ALCOHOL = ['Cervezas', 'Vinos', 'Destilados'];

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
  const filas = await db.getAllAsync<{ id: string; nombre: string; alcohol: number | null }>(
    `SELECT id, nombre, alcohol FROM categorias WHERE negocio_id = ? AND eliminado = 0
      ORDER BY nombre COLLATE NOCASE`,
    negocioId,
  );
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, alcohol: f.alcohol === 1 }));
}

export async function marcarAlcohol(db: BaseLocal, id: string, alcohol: boolean): Promise<void> {
  await db.runAsync(
    `UPDATE categorias SET alcohol = ?, actualizado_en = ?, pendiente = pendiente + 1 WHERE id = ?`,
    alcohol ? 1 : 0,
    new Date().toISOString(),
    id,
  );
}

/** Crea la categoría o devuelve la existente con el mismo nombre (sin distinguir mayúsculas). */
export async function crearCategoria(
  db: BaseLocal,
  negocioId: string,
  nombre: string,
): Promise<Categoria> {
  const limpio = nombre.trim();
  const existente = await db.getFirstAsync<{ id: string; nombre: string; alcohol: number | null }>(
    `SELECT id, nombre, alcohol FROM categorias
      WHERE negocio_id = ? AND eliminado = 0 AND nombre = ? COLLATE NOCASE`,
    negocioId,
    limpio,
  );
  if (existente) return { ...existente, alcohol: existente.alcohol === 1 };

  const id = randomUUID();
  const ahora = new Date().toISOString();
  const alcohol = CATEGORIAS_ALCOHOL.some((c) => c.toLowerCase() === limpio.toLowerCase());
  await db.runAsync(
    `INSERT INTO categorias (id, negocio_id, nombre, alcohol, creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    id,
    negocioId,
    limpio,
    alcohol ? 1 : 0,
    ahora,
    ahora,
  );
  return { id, nombre: limpio, alcohol };
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
