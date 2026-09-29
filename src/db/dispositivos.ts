import type { BaseLocal } from './tipos';

/** Registra este teléfono en el negocio (o actualiza su nombre). */
export async function registrarDispositivo(
  db: BaseLocal,
  datos: { id: string; negocioId: string; nombre: string },
): Promise<void> {
  const ahora = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO dispositivos (id, negocio_id, nombre, creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET negocio_id = excluded.negocio_id, nombre = excluded.nombre,
       actualizado_en = excluded.actualizado_en, pendiente = dispositivos.pendiente + 1`,
    datos.id,
    datos.negocioId,
    datos.nombre,
    ahora,
    ahora,
  );
}

/**
 * Informa al servidor cuándo sincronizó este teléfono por última vez.
 * Se actualiza como máximo una vez por hora para no generar un cambio que
 * subir en cada sincronización.
 */
export async function marcarSincronizado(db: BaseLocal, id: string, fecha: Date): Promise<void> {
  const haceUnaHora = new Date(fecha.getTime() - 60 * 60 * 1000).toISOString();
  await db.runAsync(
    `UPDATE dispositivos SET ultimo_sync = ?, actualizado_en = ?, pendiente = pendiente + 1
      WHERE id = ? AND (ultimo_sync IS NULL OR julianday(ultimo_sync) < julianday(?))`,
    fecha.toISOString(),
    fecha.toISOString(),
    id,
    haceUnaHora,
  );
}
