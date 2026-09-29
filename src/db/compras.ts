import { randomUUID } from 'expo-crypto';

import type { Autor } from './productos';
import type { BaseLocal } from './tipos';

export type ItemCompra = {
  productoId: string;
  nombre: string;
  cantidad: number;
  costoUnitario: number;
};

export type ResumenCompra = {
  id: string;
  creadoEn: string;
  proveedor: string | null;
  documento: string | null;
  total: number;
  items: { nombre: string; cantidad: number; costoUnitario: number; total: number }[];
};

export const totalItemCompra = (item: Pick<ItemCompra, 'cantidad' | 'costoUnitario'>) =>
  Math.round(item.cantidad * item.costoUnitario);

/**
 * Registra un ingreso de mercadería: la compra, sus ítems y un movimiento de
 * stock positivo por producto. Si `actualizarCostos`, el costo de cada
 * producto pasa a ser el de esta compra.
 */
export async function registrarCompra(
  db: BaseLocal,
  datos: {
    negocioId: string;
    proveedorId: string | null;
    documento: string;
    items: ItemCompra[];
    actualizarCostos: boolean;
    autor: Autor;
  },
): Promise<string> {
  if (datos.items.length === 0) throw new Error('El ingreso no tiene productos.');

  const compraId = randomUUID();
  const ahora = new Date().toISOString();
  const total = datos.items.reduce((suma, item) => suma + totalItemCompra(item), 0);
  const { negocioId, autor } = datos;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO compras (id, negocio_id, proveedor_id, documento, total, perfil_id, dispositivo_id,
         creado_en, actualizado_en, pendiente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      compraId,
      negocioId,
      datos.proveedorId,
      datos.documento.trim() || null,
      total,
      autor.perfilId,
      autor.dispositivoId,
      ahora,
      ahora,
    );

    for (const item of datos.items) {
      await db.runAsync(
        `INSERT INTO compra_items (id, negocio_id, compra_id, producto_id, nombre, cantidad,
           costo_unitario, total, creado_en, actualizado_en, pendiente)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        randomUUID(),
        negocioId,
        compraId,
        item.productoId,
        item.nombre,
        item.cantidad,
        item.costoUnitario,
        totalItemCompra(item),
        ahora,
        ahora,
      );
      await db.runAsync(
        `INSERT INTO movimientos_stock (id, negocio_id, producto_id, tipo, cantidad, referencia_id,
           perfil_id, dispositivo_id, creado_en, actualizado_en, pendiente)
         VALUES (?, ?, ?, 'compra', ?, ?, ?, ?, ?, ?, 1)`,
        randomUUID(),
        negocioId,
        item.productoId,
        item.cantidad,
        compraId,
        autor.perfilId,
        autor.dispositivoId,
        ahora,
        ahora,
      );
      if (datos.actualizarCostos) {
        await db.runAsync(
          `UPDATE productos SET costo = ?, actualizado_en = ?, pendiente = pendiente + 1
            WHERE id = ? AND costo <> ?`,
          item.costoUnitario,
          ahora,
          item.productoId,
          item.costoUnitario,
        );
      }
    }
  });

  return compraId;
}

/** Últimos ingresos de mercadería, con sus ítems. */
export async function listarCompras(
  db: BaseLocal,
  negocioId: string,
  limite = 50,
): Promise<ResumenCompra[]> {
  const compras = await db.getAllAsync<{
    id: string;
    creado_en: string;
    proveedor: string | null;
    documento: string | null;
    total: number;
  }>(
    `SELECT c.id, c.creado_en, p.nombre AS proveedor, c.documento, c.total
       FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id
      WHERE c.negocio_id = ? AND c.eliminado = 0
      ORDER BY c.creado_en DESC LIMIT ?`,
    negocioId,
    limite,
  );
  const resultado: ResumenCompra[] = [];
  for (const c of compras) {
    const items = await db.getAllAsync<{
      nombre: string;
      cantidad: number;
      costo_unitario: number;
      total: number;
    }>(
      `SELECT nombre, cantidad, costo_unitario, total FROM compra_items
        WHERE compra_id = ? AND eliminado = 0 ORDER BY rowid`,
      c.id,
    );
    resultado.push({
      id: c.id,
      creadoEn: c.creado_en,
      proveedor: c.proveedor,
      documento: c.documento,
      total: c.total,
      items: items.map((i) => ({
        nombre: i.nombre,
        cantidad: i.cantidad,
        costoUnitario: i.costo_unitario,
        total: i.total,
      })),
    });
  }
  return resultado;
}
