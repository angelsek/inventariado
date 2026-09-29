import { supabase } from '@/lib/supabase';

import type { Fila, Remoto } from './motor';

export const remotoSupabase: Remoto = {
  async subir(tabla, filas) {
    const { error } = await supabase.from(tabla).upsert(filas, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  },

  async descargar(tabla, negocioId, cursor) {
    const { data, error } = await supabase.rpc('sincronizar_descarga', {
      p_tabla: tabla,
      p_negocio_id: negocioId,
      p_desde: cursor,
    });
    if (error) throw new Error(error.message);
    return data as { cursor: string; filas: Fila[] };
  },
};
