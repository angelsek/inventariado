import type { BaseLocal } from './tipos';

export type Negocio = {
  id: string;
  nombre: string;
  rut: string | null;
  direccion: string | null;
  /** Horario de venta de alcohol ("HH:MM"); null = no se controla. */
  alcoholDesde: string | null;
  alcoholHasta: string | null;
};

export async function obtenerNegocio(db: BaseLocal, id: string): Promise<Negocio | null> {
  return db.getFirstAsync<Negocio>(
    `SELECT id, nombre, rut, direccion, alcohol_desde AS alcoholDesde, alcohol_hasta AS alcoholHasta
       FROM negocios WHERE id = ? AND eliminado = 0`,
    id,
  );
}

export async function actualizarNegocio(
  db: BaseLocal,
  id: string,
  datos: Omit<Negocio, 'id'>,
): Promise<void> {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error('Ingresa el nombre del negocio.');
  await db.runAsync(
    `UPDATE negocios SET nombre = ?, rut = ?, direccion = ?, alcohol_desde = ?, alcohol_hasta = ?,
       actualizado_en = ?, pendiente = pendiente + 1
     WHERE id = ?`,
    nombre,
    datos.rut?.trim() || null,
    datos.direccion?.trim() || null,
    datos.alcoholDesde,
    datos.alcoholHasta,
    new Date().toISOString(),
    id,
  );
}

/**
 * Borra todos los datos del negocio de este teléfono (al cerrar sesión).
 * No toca el id del dispositivo, que identifica al teléfono.
 */
export async function borrarDatosLocales(db: BaseLocal): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(
      `DELETE FROM negocios; DELETE FROM perfiles; DELETE FROM dispositivos;
       DELETE FROM categorias; DELETE FROM productos; DELETE FROM movimientos_stock;
       DELETE FROM ventas; DELETE FROM venta_items; DELETE FROM pagos;
       DELETE FROM proveedores; DELETE FROM compras; DELETE FROM compra_items;
       DELETE FROM cajas; DELETE FROM movimientos_caja; DELETE FROM suscripciones;
       DELETE FROM clientes; DELETE FROM movimientos_cliente;
       DELETE FROM sync_cursores; DELETE FROM ajustes WHERE clave = 'negocio_id';`,
    );
  });
}
