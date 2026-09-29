import { create } from 'zustand';

import type { Perfil } from '@/db/perfiles';

export type EstadoSync = 'inactivo' | 'sincronizando' | 'ok' | 'error';

type Sesion = {
  /** true cuando ya se leyó la base local al abrir la app. */
  cargada: boolean;
  /** Negocio vinculado a este teléfono (null: falta iniciar sesión). */
  negocioId: string | null;
  /** Persona usando la app ahora (null: falta ingresar el PIN). */
  perfil: Perfil | null;
  sync: {
    estado: EstadoSync;
    ultima: string | null;
    error: string | null;
    pendientes: number;
  };
  /** Aumenta cuando cambian datos locales; las pantallas lo usan para recargar. */
  versionDatos: number;

  cargar(negocioId: string | null): void;
  vincular(negocioId: string): void;
  desvincular(): void;
  entrar(perfil: Perfil): void;
  salir(): void;
  actualizarSync(cambios: Partial<Sesion['sync']>): void;
  datosCambiaron(): void;
};

const syncInicial: Sesion['sync'] = {
  estado: 'inactivo',
  ultima: null,
  error: null,
  pendientes: 0,
};

export const useSesion = create<Sesion>((set) => ({
  cargada: false,
  negocioId: null,
  perfil: null,
  sync: syncInicial,
  versionDatos: 0,

  cargar: (negocioId) => set({ cargada: true, negocioId }),
  vincular: (negocioId) => set({ negocioId, perfil: null }),
  desvincular: () => set({ negocioId: null, perfil: null, sync: syncInicial }),
  entrar: (perfil) => set({ perfil }),
  salir: () => set({ perfil: null }),
  actualizarSync: (cambios) => set((s) => ({ sync: { ...s.sync, ...cambios } })),
  datosCambiaron: () => set((s) => ({ versionDatos: s.versionDatos + 1 })),
}));
