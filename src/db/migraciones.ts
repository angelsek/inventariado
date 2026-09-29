import type { BaseLocal } from './tipos';

export const NOMBRE_BASE_DE_DATOS = 'inventariado.db';

/**
 * Migraciones de la base local. Cada entrada lleva la base de la versión
 * `indice` a la `indice + 1`. Nunca se modifica una migración ya publicada:
 * los cambios nuevos se agregan al final.
 */
export const migraciones: string[] = [
  // 1: tabla de ajustes clave/valor (datos del dispositivo, preferencias).
  `CREATE TABLE ajustes (
     clave TEXT PRIMARY KEY NOT NULL,
     valor TEXT NOT NULL
   );`,

  // 2 (fase 1): negocio, perfiles y dispositivos sincronizados con Supabase.
  // `pendiente` > 0 indica cambios locales aún no subidos (ver src/sync/motor.ts).
  `CREATE TABLE negocios (
     id TEXT PRIMARY KEY NOT NULL,
     nombre TEXT NOT NULL,
     rut TEXT,
     direccion TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE perfiles (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     nombre TEXT NOT NULL,
     rol TEXT NOT NULL,
     pin_hash TEXT NOT NULL,
     activo INTEGER NOT NULL DEFAULT 1,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE dispositivos (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     nombre TEXT NOT NULL,
     ultimo_sync TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE sync_cursores (
     tabla TEXT PRIMARY KEY NOT NULL,
     cursor TEXT NOT NULL
   );`,

  // 3 (fase 2): catálogo. El stock es la suma de movimientos_stock.
  `CREATE TABLE categorias (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     nombre TEXT NOT NULL,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE productos (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     nombre TEXT NOT NULL,
     codigo_barras TEXT,
     categoria_id TEXT,
     precio_venta INTEGER NOT NULL DEFAULT 0,
     costo INTEGER NOT NULL DEFAULT 0,
     stock_minimo REAL NOT NULL DEFAULT 0,
     unidad TEXT NOT NULL DEFAULT 'unidad',
     activo INTEGER NOT NULL DEFAULT 1,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX productos_codigo ON productos (negocio_id, codigo_barras);
   CREATE TABLE movimientos_stock (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     producto_id TEXT NOT NULL,
     tipo TEXT NOT NULL,
     cantidad REAL NOT NULL,
     motivo TEXT,
     referencia_id TEXT,
     perfil_id TEXT,
     dispositivo_id TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX movimientos_producto ON movimientos_stock (producto_id);`,

  // 4 (fase 3): ventas, ítems y pagos.
  `CREATE TABLE ventas (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     subtotal INTEGER NOT NULL,
     descuento INTEGER NOT NULL DEFAULT 0,
     total INTEGER NOT NULL,
     efectivo_recibido INTEGER,
     vuelto INTEGER,
     estado TEXT NOT NULL DEFAULT 'completada',
     perfil_id TEXT,
     dispositivo_id TEXT,
     anulada_en TEXT,
     anulada_por TEXT,
     motivo_anulacion TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX ventas_fecha ON ventas (negocio_id, creado_en);
   CREATE TABLE venta_items (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     venta_id TEXT NOT NULL,
     producto_id TEXT,
     nombre TEXT NOT NULL,
     cantidad REAL NOT NULL,
     precio_unitario INTEGER NOT NULL,
     costo_unitario INTEGER NOT NULL DEFAULT 0,
     descuento INTEGER NOT NULL DEFAULT 0,
     total INTEGER NOT NULL,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX venta_items_venta ON venta_items (venta_id);
   CREATE TABLE pagos (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     venta_id TEXT NOT NULL,
     medio TEXT NOT NULL,
     monto INTEGER NOT NULL,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX pagos_venta ON pagos (venta_id);`,

  // 5 (fase 4): proveedores, compras y caja.
  `CREATE TABLE proveedores (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     nombre TEXT NOT NULL,
     rut TEXT,
     telefono TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE TABLE compras (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     proveedor_id TEXT,
     documento TEXT,
     total INTEGER NOT NULL,
     perfil_id TEXT,
     dispositivo_id TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX compras_fecha ON compras (negocio_id, creado_en);
   CREATE TABLE compra_items (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     compra_id TEXT NOT NULL,
     producto_id TEXT NOT NULL,
     nombre TEXT NOT NULL,
     cantidad REAL NOT NULL,
     costo_unitario INTEGER NOT NULL,
     total INTEGER NOT NULL,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX compra_items_compra ON compra_items (compra_id);
   CREATE TABLE cajas (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     dispositivo_id TEXT,
     abierta_por TEXT,
     abierta_en TEXT NOT NULL,
     monto_inicial INTEGER NOT NULL,
     cerrada_por TEXT,
     cerrada_en TEXT,
     efectivo_esperado INTEGER,
     monto_contado INTEGER,
     notas TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX cajas_fecha ON cajas (negocio_id, abierta_en);
   CREATE TABLE movimientos_caja (
     id TEXT PRIMARY KEY NOT NULL,
     negocio_id TEXT NOT NULL,
     caja_id TEXT NOT NULL,
     tipo TEXT NOT NULL,
     monto INTEGER NOT NULL,
     motivo TEXT,
     perfil_id TEXT,
     creado_en TEXT NOT NULL,
     actualizado_en TEXT NOT NULL,
     eliminado INTEGER NOT NULL DEFAULT 0,
     pendiente INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX movimientos_caja_caja ON movimientos_caja (caja_id);
   ALTER TABLE ventas ADD COLUMN caja_id TEXT;
   CREATE INDEX ventas_caja ON ventas (caja_id);`,
];

/** Aplica las migraciones pendientes usando PRAGMA user_version. */
export async function migrarBaseDeDatos(db: BaseLocal): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const fila = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const versionActual = fila?.user_version ?? 0;

  for (let version = versionActual; version < migraciones.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(migraciones[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
