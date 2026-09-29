import { randomUUID } from 'expo-crypto';

import type { BaseLocal } from './tipos';

export type Unidad = 'unidad' | 'pack' | 'kg';

export const UNIDADES: { valor: Unidad; etiqueta: string }[] = [
  { valor: 'unidad', etiqueta: 'Unidad' },
  { valor: 'pack', etiqueta: 'Pack' },
  { valor: 'kg', etiqueta: 'Kilo' },
];

export type DatosProducto = {
  nombre: string;
  codigoBarras: string | null;
  categoriaId: string | null;
  precioVenta: number;
  costo: number;
  stockMinimo: number;
  unidad: Unidad;
};

export type Producto = DatosProducto & {
  id: string;
  negocioId: string;
  activo: boolean;
  categoria: string | null;
  /** Suma de los movimientos de stock. */
  stock: number;
};

export type TipoMovimiento = 'inicial' | 'venta' | 'compra' | 'ajuste' | 'anulacion' | 'conteo';

/** Quién y desde dónde se registra un movimiento, para la auditoría. */
export type Autor = { perfilId: string | null; dispositivoId: string | null };

type FilaProducto = {
  id: string;
  negocio_id: string;
  nombre: string;
  codigo_barras: string | null;
  categoria_id: string | null;
  categoria: string | null;
  precio_venta: number;
  costo: number;
  stock_minimo: number;
  unidad: Unidad;
  activo: number;
  stock: number;
};

const SELECT_PRODUCTO = `
  SELECT p.id, p.negocio_id, p.nombre, p.codigo_barras, p.categoria_id, c.nombre AS categoria,
         p.precio_venta, p.costo, p.stock_minimo, p.unidad, p.activo,
         COALESCE((SELECT SUM(m.cantidad) FROM movimientos_stock m
                    WHERE m.producto_id = p.id AND m.eliminado = 0), 0) AS stock
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id AND c.eliminado = 0`;

const aProducto = (f: FilaProducto): Producto => ({
  id: f.id,
  negocioId: f.negocio_id,
  nombre: f.nombre,
  codigoBarras: f.codigo_barras,
  categoriaId: f.categoria ? f.categoria_id : null,
  categoria: f.categoria,
  precioVenta: f.precio_venta,
  costo: f.costo,
  stockMinimo: f.stock_minimo,
  unidad: f.unidad,
  activo: f.activo === 1,
  stock: f.stock,
});

export type FiltroProductos = {
  busqueda?: string;
  categoriaId?: string | null;
  incluirInactivos?: boolean;
};

export async function listarProductos(
  db: BaseLocal,
  negocioId: string,
  filtro: FiltroProductos = {},
): Promise<Producto[]> {
  const condiciones = ['p.negocio_id = ?', 'p.eliminado = 0'];
  const params: (string | number)[] = [negocioId];

  if (!filtro.incluirInactivos) condiciones.push('p.activo = 1');
  if (filtro.categoriaId) {
    condiciones.push('p.categoria_id = ?');
    params.push(filtro.categoriaId);
  }
  const busqueda = filtro.busqueda?.trim();
  if (busqueda) {
    // Cada palabra debe aparecer en el nombre; o el texto es parte del código de barras.
    const palabras = busqueda.split(/\s+/);
    condiciones.push(
      `((${palabras.map(() => 'p.nombre LIKE ?').join(' AND ')}) OR p.codigo_barras LIKE ?)`,
    );
    params.push(...palabras.map((p) => `%${p}%`), `%${busqueda}%`);
  }

  const filas = await db.getAllAsync<FilaProducto>(
    `${SELECT_PRODUCTO} WHERE ${condiciones.join(' AND ')} ORDER BY p.nombre COLLATE NOCASE`,
    params,
  );
  return filas.map(aProducto);
}

export async function obtenerProducto(db: BaseLocal, id: string): Promise<Producto | null> {
  const fila = await db.getFirstAsync<FilaProducto>(
    `${SELECT_PRODUCTO} WHERE p.id = ? AND p.eliminado = 0`,
    id,
  );
  return fila ? aProducto(fila) : null;
}

/** Busca un producto por código de barras exacto (activo o no). */
export async function buscarPorCodigo(
  db: BaseLocal,
  negocioId: string,
  codigo: string,
): Promise<Producto | null> {
  const fila = await db.getFirstAsync<FilaProducto>(
    `${SELECT_PRODUCTO} WHERE p.negocio_id = ? AND p.eliminado = 0 AND p.codigo_barras = ?`,
    negocioId,
    codigo.trim(),
  );
  return fila ? aProducto(fila) : null;
}

export async function crearProducto(
  db: BaseLocal,
  negocioId: string,
  datos: DatosProducto,
  stockInicial: number,
  autor: Autor,
): Promise<string> {
  const id = randomUUID();
  const ahora = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO productos (id, negocio_id, nombre, codigo_barras, categoria_id, precio_venta,
         costo, stock_minimo, unidad, activo, creado_en, actualizado_en, pendiente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)`,
      id,
      negocioId,
      datos.nombre.trim(),
      limpiarCodigo(datos.codigoBarras),
      datos.categoriaId,
      datos.precioVenta,
      datos.costo,
      datos.stockMinimo,
      datos.unidad,
      ahora,
      ahora,
    );
    if (stockInicial !== 0) {
      await insertarMovimiento(db, negocioId, id, 'inicial', stockInicial, null, autor, ahora);
    }
  });
  return id;
}

export async function actualizarProducto(
  db: BaseLocal,
  id: string,
  datos: DatosProducto,
): Promise<void> {
  await db.runAsync(
    `UPDATE productos SET nombre = ?, codigo_barras = ?, categoria_id = ?, precio_venta = ?,
       costo = ?, stock_minimo = ?, unidad = ?, actualizado_en = ?, pendiente = pendiente + 1
     WHERE id = ?`,
    datos.nombre.trim(),
    limpiarCodigo(datos.codigoBarras),
    datos.categoriaId,
    datos.precioVenta,
    datos.costo,
    datos.stockMinimo,
    datos.unidad,
    new Date().toISOString(),
    id,
  );
}

export async function cambiarActivoProducto(
  db: BaseLocal,
  id: string,
  activo: boolean,
): Promise<void> {
  await db.runAsync(
    `UPDATE productos SET activo = ?, actualizado_en = ?, pendiente = pendiente + 1 WHERE id = ?`,
    activo ? 1 : 0,
    new Date().toISOString(),
    id,
  );
}

/** Registra un movimiento de stock (positivo suma, negativo resta). */
export async function registrarMovimiento(
  db: BaseLocal,
  datos: {
    negocioId: string;
    productoId: string;
    tipo: TipoMovimiento;
    cantidad: number;
    motivo?: string | null;
    autor: Autor;
  },
): Promise<void> {
  await insertarMovimiento(
    db,
    datos.negocioId,
    datos.productoId,
    datos.tipo,
    datos.cantidad,
    datos.motivo ?? null,
    datos.autor,
    new Date().toISOString(),
  );
}

async function insertarMovimiento(
  db: BaseLocal,
  negocioId: string,
  productoId: string,
  tipo: TipoMovimiento,
  cantidad: number,
  motivo: string | null,
  autor: Autor,
  fecha: string,
) {
  await db.runAsync(
    `INSERT INTO movimientos_stock (id, negocio_id, producto_id, tipo, cantidad, motivo,
       perfil_id, dispositivo_id, creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    randomUUID(),
    negocioId,
    productoId,
    tipo,
    cantidad,
    motivo,
    autor.perfilId,
    autor.dispositivoId,
    fecha,
    fecha,
  );
}

function limpiarCodigo(codigo: string | null): string | null {
  const limpio = codigo?.trim() ?? '';
  return limpio === '' ? null : limpio;
}

export const MOTIVOS_AJUSTE = [
  'Merma',
  'Rotura',
  'Vencimiento',
  'Consumo interno',
  'Robo o pérdida',
  'Corrección',
];

/** Ajusta el stock para que quede en `nuevoStock`, registrando la diferencia. */
export async function ajustarStock(
  db: BaseLocal,
  datos: {
    negocioId: string;
    productoId: string;
    nuevoStock: number;
    tipo: 'ajuste' | 'conteo';
    motivo: string;
    autor: Autor;
  },
): Promise<number> {
  const actual = await obtenerProducto(db, datos.productoId);
  if (!actual) throw new Error('Producto no encontrado.');
  const diferencia = Math.round((datos.nuevoStock - actual.stock) * 1000) / 1000;
  if (diferencia !== 0) {
    await registrarMovimiento(db, {
      negocioId: datos.negocioId,
      productoId: datos.productoId,
      tipo: datos.tipo,
      cantidad: diferencia,
      motivo: datos.motivo,
      autor: datos.autor,
    });
  }
  return diferencia;
}

export type MovimientoStock = {
  id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  motivo: string | null;
  perfil: string | null;
  creadoEn: string;
};

/** Historial de movimientos de un producto, del más reciente al más antiguo. */
export async function listarMovimientos(
  db: BaseLocal,
  productoId: string,
  limite = 30,
): Promise<MovimientoStock[]> {
  const filas = await db.getAllAsync<{
    id: string;
    tipo: TipoMovimiento;
    cantidad: number;
    motivo: string | null;
    perfil: string | null;
    creado_en: string;
  }>(
    `SELECT m.id, m.tipo, m.cantidad, m.motivo, p.nombre AS perfil, m.creado_en
       FROM movimientos_stock m LEFT JOIN perfiles p ON p.id = m.perfil_id
      WHERE m.producto_id = ? AND m.eliminado = 0
      ORDER BY m.creado_en DESC, m.rowid DESC LIMIT ?`,
    productoId,
    limite,
  );
  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    cantidad: f.cantidad,
    motivo: f.motivo,
    perfil: f.perfil,
    creadoEn: f.creado_en,
  }));
}

/**
 * Productos activos que hay que reponer: sin stock, o con stock igual o menor
 * al mínimo definido.
 */
export async function listarParaReponer(db: BaseLocal, negocioId: string): Promise<Producto[]> {
  const todos = await listarProductos(db, negocioId);
  return todos
    .filter((p) => p.stock <= 0 || (p.stockMinimo > 0 && p.stock <= p.stockMinimo))
    .sort((a, b) => a.stock - a.stockMinimo - (b.stock - b.stockMinimo));
}
