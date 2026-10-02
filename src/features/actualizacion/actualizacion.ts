import { Alert, Linking } from 'react-native';
import { create } from 'zustand';

import { CANAL } from '@/config';
import { supabase, supabaseConfigurado } from '@/lib/supabase';
import { versionActual } from '@/lib/version';

import { descargarEInstalar, limpiarDescargas } from './instalar';

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
  /** Avance de la descarga (0 a 1) mientras se baja el APK; null si no se está descargando. */
  progreso: number | null;
  verificar(): Promise<void>;
  /** Descarga la versión nueva dentro de la app y abre el instalador de Android. */
  actualizar(): Promise<void>;
};

/** Consulta si hay un APK más nuevo publicado (ver workflow "Construir APK" → publicar). */
export const useActualizacion = create<Estado>((set, get) => ({
  nueva: null,
  progreso: null,
  verificar: async () => {
    // Instalada desde Google Play: Play avisa y actualiza; un APK directo no se podría instalar encima.
    if (!supabaseConfigurado || CANAL === 'play') return;
    try {
      const { data } = await supabase.rpc('ultima_version');
      const ultima = data as VersionPublicada | null;
      const nueva = ultima && ultima.version_code > versionActual().codigo ? ultima : null;
      set({ nueva });
      limpiarDescargas(nueva?.version_code ?? null);
    } catch {
      // Sin conexión: se vuelve a revisar la próxima vez.
    }
  },
  actualizar: async () => {
    const { nueva, progreso } = get();
    if (!nueva || progreso !== null) return;
    set({ progreso: 0 });
    try {
      await descargarEInstalar(nueva.url, nueva.version_code, (p) => set({ progreso: p }));
    } catch {
      Alert.alert(
        'No se pudo descargar',
        'Revisa tu conexión a internet e intenta de nuevo. También puedes descargarla desde el navegador.',
        [
          { text: 'Cerrar', style: 'cancel' },
          { text: 'Abrir en el navegador', onPress: () => Linking.openURL(nueva.url) },
        ],
      );
    } finally {
      set({ progreso: null });
    }
  },
}));
