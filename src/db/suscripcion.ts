import { calcularEstado, type EstadoSuscripcion } from '@/features/suscripcion/estado';

import type { BaseLocal } from './tipos';

/** Estado de la suscripción guardada en el teléfono (se actualiza al sincronizar). */
export async function obtenerEstadoSuscripcion(
  db: BaseLocal,
  negocioId: string,
): Promise<EstadoSuscripcion | null> {
  const fila = await db.getFirstAsync<{
    plan_id: string;
    prueba_hasta: string | null;
    pagado_hasta: string | null;
    suspendida: number;
  }>(
    `SELECT plan_id, prueba_hasta, pagado_hasta, suspendida FROM suscripciones
      WHERE negocio_id = ? AND eliminado = 0`,
    negocioId,
  );
  if (!fila) return null;
  return calcularEstado({
    planId: fila.plan_id,
    pruebaHasta: fila.prueba_hasta,
    pagadoHasta: fila.pagado_hasta,
    suspendida: fila.suspendida === 1,
  });
}

/** true si este teléfono fue desvinculado del negocio desde otro teléfono. */
export async function dispositivoDesvinculado(
  db: BaseLocal,
  dispositivoId: string,
): Promise<boolean> {
  const fila = await db.getFirstAsync<{ eliminado: number }>(
    'SELECT eliminado FROM dispositivos WHERE id = ?',
    dispositivoId,
  );
  return fila?.eliminado === 1;
}
