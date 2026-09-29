import { create } from 'zustand';

import { CANAL } from '@/config';
import { supabase, supabaseConfigurado } from '@/lib/supabase';
import { versionActual } from '@/lib/version';

export type VersionPublicada = {
  version_code: number;
  version: string;
  url: string;
  notas: string | null;
  obligatoria: boolean;
};

type Estado = {
  /** Versión más nueva que la instalada, si hay. */
  nueva: VersionPublicada | null;
  verificar(): Promise<void>;
};

/** Consulta si hay un APK más nuevo publicado (ver workflow "Construir APK" → publicar). */
export const useActualizacion = create<Estado>((set) => ({
  nueva: null,
  verificar: async () => {
    // Instalada desde Google Play: Play avisa y actualiza; un APK directo no se podría instalar encima.
    if (!supabaseConfigurado || CANAL === 'play') return;
    try {
      const { data } = await supabase.rpc('ultima_version');
      const ultima = data as VersionPublicada | null;
      set({ nueva: ultima && ultima.version_code > versionActual().codigo ? ultima : null });
    } catch {
      // Sin conexión: se vuelve a revisar la próxima vez.
    }
  },
}));
