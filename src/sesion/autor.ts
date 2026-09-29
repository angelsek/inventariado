import { AJUSTE_DISPOSITIVO, leerAjuste } from '@/db/ajustes';
import type { Autor } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';

import { useSesion } from './store';

/** Perfil y teléfono actuales, para registrar quién hizo cada movimiento. */
export async function obtenerAutor(db: BaseLocal): Promise<Autor> {
  return {
    perfilId: useSesion.getState().perfil?.id ?? null,
    dispositivoId: await leerAjuste(db, AJUSTE_DISPOSITIVO),
  };
}
