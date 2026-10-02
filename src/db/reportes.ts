import { type MedioPago, porMedioVacio } from '@/features/ventas/calculos';
import { claveDia, esPeriodoActual, moverPeriodo, type Periodo } from '@/features/reportes/periodo';

import { listarProductos } from './productos';
import type { BaseLocal } from './tipos';

export type FilaMonto = { nombre: string; monto: number; cantidad: number };

export type ProductoVendido = {
  productoId: string | null;
  nombre: string;
  unidad: string;
  cantidad: number;
  monto: number;
  ganancia: number;
};

export type ProductoSinVenta = { id: string; nombre: string; stock: number; valorCosto: number };

export type Reporte = {
  total: number;
  cantidad: number;
  ticketPromedio: number;
  ganancia: number;
  /** Ganancia / total, entre 0 y 1. */
  margen: number;
  descuentos: number;
  anuladas: { cantidad: number; monto: number };
  /** Ítems vendidos con costo 0: la ganancia real es menor a la calculada. */
  itemsSinCosto: number;
  /** Mismo tramo del período anterior (si el período está en curso, hasta la misma hora). */
  anterior: { total: number; cantidad: number };
  porMedio: Record<MedioPago, number>;
  /** Un elemento por día del período (semana o mes), con 0 si no hubo ventas. */
  porDia: { dia: Date; monto: number; cantidad: number }[];
  /** Ventas por hora del día (0 a 23). */
  porHora: { hora: number; monto: number; cantidad: number }[];
  porCajero: FilaMonto[];
  porCategoria: FilaMonto[];
  productos: ProductoVendido[];
  sinVentas: ProductoSinVenta[];
};

const VENTAS_DEL_PERIODO = `v.negocio_id = ? AND v.eliminado = 0 AND v.estado = 'completada'
  AND v.creado_en >= ? AND v.creado_en < ?`;

async function totales(db: BaseLocal, negocioId: string, desde: string, hasta: string) {
  const fila = await db.getFirstAsync<{ cantidad: number; total: number | null }>(
    `SELECT COUNT(*) AS cantidad, SUM(v.total) AS total FROM ventas v WHERE ${VENTAS_DEL_PERIODO}`,
    negocioId,
    desde,
    hasta,
  );
  return { cantidad: fila?.cantidad ?? 0, total: fila?.total ?? 0 };
}

/**
 * Reporte de ventas de un período, calculado con los datos del teléfono
 * (que incluyen las ventas de todos los teléfonos ya sincronizadas).
 */
export async function generarReporte(
  db: BaseLocal,
  negocioId: string,
  periodo: Periodo,
  ahora = new Date(),
): Promise<Reporte> {
  const desde = periodo.inicio.toISOString();
  const hasta = periodo.fin.toISOString();
  const params = [negocioId, desde, hasta];

  const ventas = await db.getAllAsync<{
    creado_en: string;
    total: number;
    descuento: number;
    cajero: string | null;
  }>(
    `SELECT v.creado_en, v.total, v.descuento, p.nombre AS cajero
       FROM ventas v LEFT JOIN perfiles p ON p.id = v.perfil_id
      WHERE ${VENTAS_DEL_PERIODO}`,
    params,
  );

  const costos = await db.getFirstAsync<{ costo: number | null; sin_costo: number }>(
    `SELECT SUM(i.costo_unitario * i.cantidad) AS costo,
            SUM(CASE WHEN i.costo_unitario = 0 THEN 1 ELSE 0 END) AS sin_costo
       FROM venta_items i JOIN ventas v ON v.id = i.venta_id
      WHERE i.eliminado = 0 AND ${VENTAS_DEL_PERIODO}`,
    params,
  );

  const anuladas = await db.getFirstAsync<{ cantidad: number; monto: number | null }>(
    `SELECT COUNT(*) AS cantidad, SUM(total) AS monto FROM ventas
      WHERE negocio_id = ? AND eliminado = 0 AND estado = 'anulada'
        AND creado_en >= ? AND creado_en < ?`,
    params,
  );

  const medios = await db.getAllAsync<{ medio: MedioPago; monto: number }>(
    `SELECT g.medio, SUM(g.monto) AS monto FROM pagos g JOIN ventas v ON v.id = g.venta_id
      WHERE g.eliminado = 0 AND ${VENTAS_DEL_PERIODO}
      GROUP BY g.medio`,
    params,
  );

  const categorias = await db.getAllAsync<FilaMonto>(
    `SELECT COALESCE(c.nombre, 'Sin categoría') AS nombre, SUM(i.total) AS monto,
            SUM(i.cantidad) AS cantidad
       FROM venta_items i JOIN ventas v ON v.id = i.venta_id
       LEFT JOIN productos p ON p.id = i.producto_id
       LEFT JOIN categorias c ON c.id = p.categoria_id AND c.eliminado = 0
      WHERE i.eliminado = 0 AND ${VENTAS_DEL_PERIODO}
      GROUP BY 1 ORDER BY monto DESC`,
    params,
  );

  const productos = await db.getAllAsync<{
    producto_id: string | null;
    nombre: string;
    unidad: string | null;
    cantidad: number;
    monto: number;
    costo: number;
  }>(
    `SELECT i.producto_id, COALESCE(MAX(p.nombre), MAX(i.nombre)) AS nombre, MAX(p.unidad) AS unidad,
            SUM(i.cantidad) AS cantidad, SUM(i.total) AS monto,
            SUM(i.costo_unitario * i.cantidad) AS costo
       FROM venta_items i JOIN ventas v ON v.id = i.venta_id
       LEFT JOIN productos p ON p.id = i.producto_id
      WHERE i.eliminado = 0 AND ${VENTAS_DEL_PERIODO}
      GROUP BY COALESCE(i.producto_id, i.nombre)
      ORDER BY monto DESC`,
    params,
  );

  // Productos activos con stock que no se vendieron en el período.
  const vendidos = new Set(productos.map((p) => p.producto_id));
  const sinVentas = (await listarProductos(db, negocioId))
    .filter((p) => !vendidos.has(p.id) && p.stock > 0)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      stock: p.stock,
      valorCosto: Math.round(p.stock * p.costo),
    }))
    .sort((a, b) => b.valorCosto - a.valorCosto || a.nombre.localeCompare(b.nombre));

  // Comparación justa: si el período está en curso, el anterior se corta en el mismo punto.
  const previo = moverPeriodo(periodo, -1);
  const finPrevio = esPeriodoActual(periodo, ahora)
    ? new Date(previo.inicio.getTime() + (ahora.getTime() - periodo.inicio.getTime()))
    : previo.fin;
  const anterior = await totales(
    db,
    negocioId,
    previo.inicio.toISOString(),
    finPrevio.toISOString(),
  );

  // Agrupaciones por día, hora y cajero, en hora local.
  const dias = new Map<string, { dia: Date; monto: number; cantidad: number }>();
  if (periodo.tipo !== 'dia') {
    for (let d = new Date(periodo.inicio); d < periodo.fin;) {
      dias.set(claveDia(d), { dia: d, monto: 0, cantidad: 0 });
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
  }
  const horas = new Map<number, { hora: number; monto: number; cantidad: number }>();
  const cajeros = new Map<string, FilaMonto>();
  let total = 0;
  let descuentos = 0;
  for (const v of ventas) {
    const fecha = new Date(v.creado_en);
    total += v.total;
    descuentos += v.descuento;
    const dia = dias.get(claveDia(fecha));
    if (dia) {
      dia.monto += v.total;
      dia.cantidad += 1;
    }
    const hora = horas.get(fecha.getHours()) ?? { hora: fecha.getHours(), monto: 0, cantidad: 0 };
    hora.monto += v.total;
    hora.cantidad += 1;
    horas.set(hora.hora, hora);
    const nombre = v.cajero ?? 'Sin usuario';
    const cajero = cajeros.get(nombre) ?? { nombre, monto: 0, cantidad: 0 };
    cajero.monto += v.total;
    cajero.cantidad += 1;
    cajeros.set(nombre, cajero);
  }

  const porMedio = porMedioVacio();
  for (const m of medios) porMedio[m.medio] = m.monto;

  const ganancia = total - Math.round(costos?.costo ?? 0);
  return {
    total,
    cantidad: ventas.length,
    ticketPromedio: ventas.length ? Math.round(total / ventas.length) : 0,
    ganancia,
    margen: total > 0 ? ganancia / total : 0,
    descuentos,
    anuladas: { cantidad: anuladas?.cantidad ?? 0, monto: anuladas?.monto ?? 0 },
    itemsSinCosto: costos?.sin_costo ?? 0,
    anterior,
    porMedio,
    porDia: [...dias.values()],
    porHora: [...horas.values()].sort((a, b) => a.hora - b.hora),
    porCajero: [...cajeros.values()].sort((a, b) => b.monto - a.monto),
    porCategoria: categorias,
    productos: productos.map((p) => ({
      productoId: p.producto_id,
      nombre: p.nombre,
      unidad: p.unidad ?? 'unidad',
      cantidad: p.cantidad,
      monto: p.monto,
      ganancia: p.monto - Math.round(p.costo),
    })),
    sinVentas,
  };
}

export type ProductoValorizado = {
  id: string;
  nombre: string;
  stock: number;
  precio: number;
  costo: number;
  /** (precio - costo) / precio; null si no tiene precio o costo. */
  margen: number | null;
};

export type Inventario = {
  valorCosto: number;
  valorVenta: number;
  productosConStock: number;
  stockNegativo: number;
  sinCosto: number;
  productos: ProductoValorizado[];
};

/** Cuánto vale hoy la mercadería en bodega, y el margen de cada producto. */
export async function valorizarInventario(db: BaseLocal, negocioId: string): Promise<Inventario> {
  const productos = await listarProductos(db, negocioId);
  let valorCosto = 0;
  let valorVenta = 0;
  let productosConStock = 0;
  for (const p of productos) {
    if (p.stock <= 0) continue;
    productosConStock += 1;
    valorCosto += p.stock * p.costo;
    valorVenta += p.stock * p.precioVenta;
  }
  return {
    valorCosto: Math.round(valorCosto),
    valorVenta: Math.round(valorVenta),
    productosConStock,
    stockNegativo: productos.filter((p) => p.stock < 0).length,
    sinCosto: productos.filter((p) => p.costo === 0).length,
    productos: productos
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        stock: p.stock,
        precio: p.precioVenta,
        costo: p.costo,
        margen: p.precioVenta > 0 && p.costo > 0 ? (p.precioVenta - p.costo) / p.precioVenta : null,
      }))
      // Primero los de menor margen (los que conviene revisar); sin costo al final.
      .sort((a, b) => (a.margen ?? 2) - (b.margen ?? 2) || a.nombre.localeCompare(b.nombre)),
  };
}
