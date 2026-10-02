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
    columnas: ['id', 'nombre', 'rut', 'direccion', 'alcohol_desde', 'alcohol_hasta', ...control],
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
    columnas: ['id', 'negocio_id', 'nombre', 'alcohol', ...control],
    booleanas: ['alcohol', 'eliminado'],
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
      'precio_envase',
      'pack_producto_id',
      'pack_cantidad',
      'promo_cantidad',
      'promo_precio',
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
    nombre: 'cajas',
    columnas: [
      'id',
      'negocio_id',
      'dispositivo_id',
      'abierta_por',
      'abierta_en',
      'monto_inicial',
      'cerrada_por',
      'cerrada_en',
      'efectivo_esperado',
      'monto_contado',
      'notas',
      ...control,
    ],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'movimientos_caja',
    columnas: ['id', 'negocio_id', 'caja_id', 'tipo', 'monto', 'motivo', 'perfil_id', ...control],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'clientes',
    columnas: ['id', 'negocio_id', 'nombre', 'telefono', 'limite_credito', 'activo', ...control],
    booleanas: ['activo', 'eliminado'],
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
      'caja_id',
      'cliente_id',
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
  {
    nombre: 'movimientos_cliente',
    columnas: [
      'id',
      'negocio_id',
      'cliente_id',
      'tipo',
      'monto',
      'venta_id',
      'medio',
      'notas',
      'perfil_id',
      'dispositivo_id',
      ...control,
    ],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'proveedores',
    columnas: ['id', 'negocio_id', 'nombre', 'rut', 'telefono', ...control],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'compras',
    columnas: [
      'id',
      'negocio_id',
      'proveedor_id',
      'documento',
      'total',
      'perfil_id',
      'dispositivo_id',
      ...control,
    ],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'compra_items',
    columnas: [
      'id',
      'negocio_id',
      'compra_id',
      'producto_id',
      'nombre',
      'cantidad',
      'costo_unitario',
      'total',
      ...control,
    ],
    booleanas: ['eliminado'],
  },
  {
    // Solo se descarga: la app nunca la modifica (no hay filas pendientes que subir).
    nombre: 'suscripciones',
    columnas: [
      'id',
      'negocio_id',
      'plan_id',
      'prueba_hasta',
      'pagado_hasta',
      'suspendida',
      'notas',
      ...control,
    ],
    booleanas: ['suspendida', 'eliminado'],
  },
];
