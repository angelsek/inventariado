import type { BaseLocal } from './tipos';

export type Negocio = {
  id: string;
  nombre: string;
  rut: string | null;
  direccion: string | null;
};

export async function obtenerNegocio(db: BaseLocal, id: string): Promise<Negocio | null> {
  return db.getFirstAsync<Negocio>(
    'SELECT id, nombre, rut, direccion FROM negocios WHERE id = ? AND eliminado = 0',
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
       DELETE FROM sync_cursores; DELETE FROM ajustes WHERE clave = 'negocio_id';`,
    );
  });
}
