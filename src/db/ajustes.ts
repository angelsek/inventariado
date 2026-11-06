import type { BaseLocal } from './tipos';

export const AJUSTE_NEGOCIO = 'negocio_id';
export const AJUSTE_DISPOSITIVO = 'dispositivo_id';
/** Último local abierto en este equipo: solo una pista para elegir cuál abrir al iniciar sesión. */
export const AJUSTE_ULTIMO_LOCAL = 'ultimo_negocio_id';
/** Local desde el que se llegó al actual (JSON). Permite volver aunque falte el permiso. */
export const AJUSTE_LOCAL_ORIGEN = 'local_origen';

export async function leerAjuste(db: BaseLocal, clave: string): Promise<string | null> {
  const fila = await db.getFirstAsync<{ valor: string }>(
    'SELECT valor FROM ajustes WHERE clave = ?',
    clave,
  );
  return fila?.valor ?? null;
}

export async function guardarAjuste(db: BaseLocal, clave: string, valor: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ' +
      'ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor',
    clave,
    valor,
  );
}
