import { Alert, Linking } from 'react-native';
import { create } from 'zustand';

import { CANAL } from '@/config';
import { informarError } from '@/lib/errores';
import { supabase, supabaseConfigurado } from '@/lib/supabase';
import { versionActual } from '@/lib/version';

import {
  ErrorIntegridad,
  ErrorOrigen,
  PRIMER_CODIGO_CON_HASH,
  urlApkPermitida,
} from './integridad';
import { descargarEInstalar, limpiarDescargas } from './instalar';

export type VersionPublicada = {
  version_code: number;
  version: string;
  url: string;
  /** SHA-256 del APK publicado (null en versiones publicadas antes de que existiera). */
  sha256?: string | null;
  notas: string | null;
  obligatoria: boolean;
};

type Estado = {
  /** Versión más nueva que la instalada, si hay. */
  nueva: VersionPublicada | null;
  /** Avance de la descarga (0 a 1) mientras se baja el APK; null si no se está descargando. */
  progreso: number | null;
  /** true mientras se comprueba que el APK descargado coincide con el publicado. */
  verificando: boolean;
  verificar(): Promise<void>;
  /** Descarga la versión nueva dentro de la app, la verifica y abre el instalador de Android. */
  actualizar(): Promise<void>;
};

/** Consulta si hay un APK más nuevo publicado (ver workflow "Construir APK" → publicar). */
export const useActualizacion = create<Estado>((set, get) => ({
  nueva: null,
  progreso: null,
  verificando: false,
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
    set({ progreso: 0, verificando: false });
    const sha256 = nueva.sha256 ?? null;
    if (sha256 === null && nueva.version_code < PRIMER_CODIGO_CON_HASH) {
      // Versiones publicadas antes del hash: se instalan igual y queda registrado.
      // (Desde PRIMER_CODIGO_CON_HASH no se instalan: lo informa la rama de ErrorOrigen).
      void informarError(
        new Error(`Versión ${nueva.version_code} publicada sin sha256: se instala sin verificar.`),
        'Actualización',
      );
    }
    try {
      await descargarEInstalar(
        nueva.url,
        nueva.version_code,
        sha256,
        // Si tras verificar un APK en caché hay que descargarlo de nuevo, vuelve el porcentaje.
        (p) => set({ progreso: p, verificando: false }),
        () => set({ verificando: true }),
      );
    } catch (error) {
      if (error instanceof ErrorOrigen) {
        void informarError(error, 'Actualización');
        // Reintentar fallaría igual y el navegador se saltaría la verificación.
        Alert.alert(
          'No se puede instalar esta versión',
          'La versión publicada no se puede verificar ni instalar desde la app. Avisa a soporte.',
          [{ text: 'Cerrar', style: 'cancel' }],
        );
      } else if (error instanceof ErrorIntegridad) {
        void informarError(error, 'Actualización');
        // Sin "Abrir en el navegador": esa descarga se saltaría la verificación.
        Alert.alert(
          'La descarga no se instaló',
          'La versión descargada llegó dañada o no coincide con la publicada, así que se borró. Intenta de nuevo.',
          [
            { text: 'Cerrar', style: 'cancel' },
            { text: 'Reintentar', onPress: () => void get().actualizar() },
          ],
        );
      } else {
        Alert.alert(
          'No se pudo descargar',
          urlApkPermitida(nueva.url)
            ? 'Revisa tu conexión a internet e intenta de nuevo. También puedes descargarla desde el navegador.'
            : 'Revisa tu conexión a internet e intenta de nuevo.',
          [
            { text: 'Cerrar', style: 'cancel' },
            ...(urlApkPermitida(nueva.url)
              ? [{ text: 'Abrir en el navegador', onPress: () => Linking.openURL(nueva.url) }]
              : []),
          ],
        );
      }
    } finally {
      set({ progreso: null, verificando: false });
    }
  },
}));
