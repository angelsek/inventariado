import { randomUUID } from 'expo-crypto';

import type { ItemCarrito, MedioPago, Pago } from '@/features/ventas/calculos';
import { calcularTotales, totalItem } from '@/features/ventas/calculos';

import type { Autor } from './productos';
import type { BaseLocal } from './tipos';

export type EstadoVenta = 'completada' | 'anulada';

export type ResumenVenta = {
  id: string;
  creadoEn: string;
  total: number;
  estado: EstadoVenta;
  vendedor: string | null;
  cantidadItems: number;
  medios: MedioPago[];
};

export type DetalleVenta = {
  id: string;
  creadoEn: string;
  subtotal: number;
  descuento: number;
  total: number;
  efectivoRecibido: number | null;
  vuelto: number | null;
  estado: EstadoVenta;
  vendedor: string | null;
  anuladaEn: string | null;
  anuladaPor: string | null;
  motivoAnulacion: string | null;
  items: {
    id: string;
    productoId: string | null;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    total: number;
  }[];
  pagos: Pago[];
};

/**
 * Registra una venta completa en una sola transacción: la venta, sus ítems,
 * los pagos y un movimiento de stock negativo por cada producto del catálogo.
 */
export async function registrarVenta(
  db: BaseLocal,
  datos: {
    negocioId: string;
    items: ItemCarrito[];
    descuentoGeneral: number;
    pagos: Pago[];
    efectivoRecibido: number | null;
    vuelto: number | null;
    autor: Autor;
  },
): Promise<string> {
  if (datos.items.length === 0) throw new Error('La venta no tiene productos.');

  const ventaId = randomUUID();
  const ahora = new Date().toISOString();
  const { subtotal, descuento, total } = calcularTotales(datos.items, datos.descuentoGeneral);
  const { negocioId, autor } = datos;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO ventas (id, negocio_id, subtotal, descuento, total, efectivo_recibido, vuelto,
         estado, perfil_id, dispositivo_id, creado_en, actualizado_en, pendiente)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'completada', ?, ?, ?, ?, 1)`,
      ventaId,
      negocioId,
      subtotal,
      descuento,
      total,
      datos.efectivoRecibido,
      datos.vuelto,
      autor.perfilId,
      autor.dispositivoId,
      ahora,
      ahora,
    );

    for (const item of datos.items) {
      await db.runAsync(
        `INSERT INTO venta_items (id, negocio_id, venta_id, producto_id, nombre, cantidad,
           precio_unitario, costo_unitario, descuento, total, creado_en, actualizado_en, pendiente)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        randomUUID(),
        negocioId,
        ventaId,
        item.productoId,
        item.nombre,
        item.cantidad,
        item.precioUnitario,
        item.costoUnitario,
        item.descuento,
        totalItem(item),
        ahora,
        ahora,
      );
      if (item.productoId) {
        await insertarMovimiento(
          db,
          negocioId,
          item.productoId,
          'venta',
          -item.cantidad,
          ventaId,
          autor,
          ahora,
        );
      }
    }

    for (const pago of datos.pagos) {
      await db.runAsync(
        `INSERT INTO pagos (id, negocio_id, venta_id, medio, monto, creado_en, actualizado_en, pendiente)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        randomUUID(),
        negocioId,
        ventaId,
        pago.medio,
        pago.monto,
        ahora,
        ahora,
      );
    }
  });

  return ventaId;
}

/** Anula una venta y devuelve al stock lo vendido. No hace nada si ya estaba anulada. */
export async function anularVenta(
  db: BaseLocal,
  ventaId: string,
  motivo: string,
  autor: Autor,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    const venta = await db.getFirstAsync<{ negocio_id: string; estado: string }>(
      'SELECT negocio_id, estado FROM ventas WHERE id = ?',
      ventaId,
    );
    if (!venta || venta.estado === 'anulada') return;

    const ahora = new Date().toISOString();
    await db.runAsync(
      `UPDATE ventas SET estado = 'anulada', anulada_en = ?, anulada_por = ?, motivo_anulacion = ?,
         actualizado_en = ?, pendiente = pendiente + 1
       WHERE id = ?`,
      ahora,
      autor.perfilId,
      motivo.trim() || null,
      ahora,
      ventaId,
    );

    const items = await db.getAllAsync<{ producto_id: string | null; cantidad: number }>(
      'SELECT producto_id, cantidad FROM venta_items WHERE venta_id = ? AND eliminado = 0',
      ventaId,
    );
    for (const item of items) {
      if (item.producto_id) {
        await insertarMovimiento(
          db,
          venta.negocio_id,
          item.producto_id,
          'anulacion',
          item.cantidad,
          ventaId,
          autor,
          ahora,
        );
      }
    }
  });
}

/** Ventas entre dos instantes (ISO), de la más reciente a la más antigua. */
export async function listarVentas(
  db: BaseLocal,
  negocioId: string,
  desde: string,
  hasta: string,
): Promise<ResumenVenta[]> {
  const filas = await db.getAllAsync<{
    id: string;
    creado_en: string;
    total: number;
    estado: EstadoVenta;
    vendedor: string | null;
    cantidad_items: number;
    medios: string | null;
  }>(
    `SELECT v.id, v.creado_en, v.total, v.estado, p.nombre AS vendedor,
            (SELECT COUNT(*) FROM venta_items i WHERE i.venta_id = v.id AND i.eliminado = 0) AS cantidad_items,
            (SELECT GROUP_CONCAT(DISTINCT g.medio) FROM pagos g WHERE g.venta_id = v.id AND g.eliminado = 0) AS medios
       FROM ventas v
       LEFT JOIN perfiles p ON p.id = v.perfil_id
      WHERE v.negocio_id = ? AND v.eliminado = 0 AND v.creado_en >= ? AND v.creado_en < ?
      ORDER BY v.creado_en DESC`,
    negocioId,
    desde,
    hasta,
  );
  return filas.map((f) => ({
    id: f.id,
    creadoEn: f.creado_en,
    total: f.total,
    estado: f.estado,
    vendedor: f.vendedor,
    cantidadItems: f.cantidad_items,
    medios: (f.medios?.split(',') ?? []) as MedioPago[],
  }));
}

/** Totales de ventas completadas entre dos instantes, por medio de pago. */
export async function resumirVentas(
  db: BaseLocal,
  negocioId: string,
  desde: string,
  hasta: string,
): Promise<{ cantidad: number; total: number; porMedio: Record<MedioPago, number> }> {
  const totales = await db.getFirstAsync<{ cantidad: number; total: number | null }>(
    `SELECT COUNT(*) AS cantidad, SUM(total) AS total FROM ventas
      WHERE negocio_id = ? AND eliminado = 0 AND estado = 'completada'
        AND creado_en >= ? AND creado_en < ?`,
    negocioId,
    desde,
    hasta,
  );
  const medios = await db.getAllAsync<{ medio: MedioPago; monto: number }>(
    `SELECT g.medio, SUM(g.monto) AS monto FROM pagos g
       JOIN ventas v ON v.id = g.venta_id
      WHERE v.negocio_id = ? AND v.eliminado = 0 AND v.estado = 'completada' AND g.eliminado = 0
        AND v.creado_en >= ? AND v.creado_en < ?
      GROUP BY g.medio`,
    negocioId,
    desde,
    hasta,
  );
  const porMedio: Record<MedioPago, number> = {
    efectivo: 0,
    debito: 0,
    credito: 0,
    transferencia: 0,
  };
  for (const m of medios) porMedio[m.medio] = m.monto;
  return { cantidad: totales?.cantidad ?? 0, total: totales?.total ?? 0, porMedio };
}

export async function obtenerVenta(db: BaseLocal, id: string): Promise<DetalleVenta | null> {
  const v = await db.getFirstAsync<{
    id: string;
    creado_en: string;
    subtotal: number;
    descuento: number;
    total: number;
    efectivo_recibido: number | null;
    vuelto: number | null;
    estado: EstadoVenta;
    vendedor: string | null;
    anulada_en: string | null;
    anulada_por: string | null;
    motivo_anulacion: string | null;
  }>(
    `SELECT v.*, p.nombre AS vendedor, a.nombre AS anulada_por
       FROM ventas v
       LEFT JOIN perfiles p ON p.id = v.perfil_id
       LEFT JOIN perfiles a ON a.id = v.anulada_por
      WHERE v.id = ? AND v.eliminado = 0`,
    id,
  );
  if (!v) return null;

  const items = await db.getAllAsync<{
    id: string;
    producto_id: string | null;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    descuento: number;
    total: number;
  }>(
    `SELECT id, producto_id, nombre, cantidad, precio_unitario, descuento, total
       FROM venta_items WHERE venta_id = ? AND eliminado = 0 ORDER BY creado_en, rowid`,
    id,
  );
  const pagos = await db.getAllAsync<Pago>(
    'SELECT medio, monto FROM pagos WHERE venta_id = ? AND eliminado = 0 ORDER BY rowid',
    id,
  );

  return {
    id: v.id,
    creadoEn: v.creado_en,
    subtotal: v.subtotal,
    descuento: v.descuento,
    total: v.total,
    efectivoRecibido: v.efectivo_recibido,
    vuelto: v.vuelto,
    estado: v.estado,
    vendedor: v.vendedor,
    anuladaEn: v.anulada_en,
    anuladaPor: v.anulada_por,
    motivoAnulacion: v.motivo_anulacion,
    items: items.map((i) => ({
      id: i.id,
      productoId: i.producto_id,
      nombre: i.nombre,
      cantidad: i.cantidad,
      precioUnitario: i.precio_unitario,
      descuento: i.descuento,
      total: i.total,
    })),
    pagos,
  };
}

async function insertarMovimiento(
  db: BaseLocal,
  negocioId: string,
  productoId: string,
  tipo: 'venta' | 'anulacion',
  cantidad: number,
  ventaId: string,
  autor: Autor,
  fecha: string,
) {
  await db.runAsync(
    `INSERT INTO movimientos_stock (id, negocio_id, producto_id, tipo, cantidad, referencia_id,
       perfil_id, dispositivo_id, creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    randomUUID(),
    negocioId,
    productoId,
    tipo,
    cantidad,
    ventaId,
    autor.perfilId,
    autor.dispositivoId,
    fecha,
    fecha,
  );
}
