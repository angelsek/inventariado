/**
 * Tablas que se sincronizan con Supabase, en el orden en que se suben
 * (primero las que otras referencian).
 */
export type TablaSync = {
  nombre: string;
  /** Columnas compartidas con el servidor (sin `pendiente`). */
  columnas: readonly string[];
  /** Columnas guardadas como 0/1 en SQLite y como boolean en Postgres. */
  booleanas: readonly string[];
};

const control = ['creado_en', 'actualizado_en', 'eliminado'] as const;

export const TABLAS_SYNC: readonly TablaSync[] = [
  {
    nombre: 'negocios',
    columnas: ['id', 'nombre', 'rut', 'direccion', ...control],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'dispositivos',
    columnas: ['id', 'negocio_id', 'nombre', 'ultimo_sync', ...control],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'perfiles',
    columnas: ['id', 'negocio_id', 'nombre', 'rol', 'pin_hash', 'activo', ...control],
    booleanas: ['activo', 'eliminado'],
  },
  {
    nombre: 'categorias',
    columnas: ['id', 'negocio_id', 'nombre', ...control],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'productos',
    columnas: [
      'id',
      'negocio_id',
      'nombre',
      'codigo_barras',
      'categoria_id',
      'precio_venta',
      'costo',
      'stock_minimo',
      'unidad',
      'activo',
      ...control,
    ],
    booleanas: ['activo', 'eliminado'],
  },
  {
    nombre: 'movimientos_stock',
    columnas: [
      'id',
      'negocio_id',
      'producto_id',
      'tipo',
      'cantidad',
      'motivo',
      'referencia_id',
      'perfil_id',
      'dispositivo_id',
      ...control,
    ],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'ventas',
    columnas: [
      'id',
      'negocio_id',
      'subtotal',
      'descuento',
      'total',
      'efectivo_recibido',
      'vuelto',
      'estado',
      'perfil_id',
      'dispositivo_id',
      'anulada_en',
      'anulada_por',
      'motivo_anulacion',
      ...control,
    ],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'venta_items',
    columnas: [
      'id',
      'negocio_id',
      'venta_id',
      'producto_id',
      'nombre',
      'cantidad',
      'precio_unitario',
      'costo_unitario',
      'descuento',
      'total',
      ...control,
    ],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'pagos',
    columnas: ['id', 'negocio_id', 'venta_id', 'medio', 'monto', ...control],
    booleanas: ['eliminado'],
  },
];
