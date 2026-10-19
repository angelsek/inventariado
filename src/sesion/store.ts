import { create } from 'zustand';

import type { Perfil } from '@/db/perfiles';
import type { Permiso } from '@/features/permisos/catalogo';
import type { EstadoSuscripcion } from '@/features/suscripcion/estado';

export type EstadoSync = 'inactivo' | 'sincronizando' | 'ok' | 'error';

/** Rol de la persona que usa la app (null: dueño, o persona sin rol todavía). */
export type RolSesion = { nombre: string; permisos: readonly Permiso[]; eliminado: boolean };

type Sesion = {
  /** true cuando ya se leyó la base local al abrir la app. */
  cargada: boolean;
  /** Negocio vinculado a este teléfono (null: falta iniciar sesión). */
  negocioId: string | null;
  /** Persona usando la app ahora (null: falta ingresar el PIN). */
  perfil: Perfil | null;
  /** Rol del perfil; los permisos se calculan con src/sesion/permisos.ts. */
  rol: RolSesion | null;
  sync: {
    estado: EstadoSync;
    ultima: string | null;
    error: string | null;
    pendientes: number;
  };
  /** Aumenta cuando cambian datos locales; las pantallas lo usan para recargar. */
  versionDatos: number;
  /** Estado de la suscripción del negocio (null: aún no se descarga). */
  suscripcion: EstadoSuscripcion | null;
  /** Mensaje para mostrar en la bienvenida tras un cierre de sesión forzado. */
  avisoSalida: string | null;

  cargar(negocioId: string | null): void;
  vincular(negocioId: string): void;
  desvincular(): void;
  entrar(perfil: Perfil, rol?: RolSesion | null): void;
  /** Actualiza el perfil y su rol tras sincronizar (el dueño pudo cambiarlos en otro equipo). */
  refrescarPerfil(perfil: Perfil, rol: RolSesion | null): void;
  salir(): void;
  actualizarSync(cambios: Partial<Sesion['sync']>): void;
  datosCambiaron(): void;
  fijarSuscripcion(suscripcion: EstadoSuscripcion | null): void;
  fijarAvisoSalida(aviso: string | null): void;
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
  rol: null,
  sync: syncInicial,
  versionDatos: 0,
  suscripcion: null,
  avisoSalida: null,

  cargar: (negocioId) => set({ cargada: true, negocioId }),
  vincular: (negocioId) => set({ negocioId, perfil: null, rol: null }),
  desvincular: () =>
    set({ negocioId: null, perfil: null, rol: null, sync: syncInicial, suscripcion: null }),
  entrar: (perfil, rol = null) => set({ perfil, rol }),
  refrescarPerfil: (perfil, rol) => set({ perfil, rol }),
  salir: () => set({ perfil: null, rol: null }),
  actualizarSync: (cambios) => set((s) => ({ sync: { ...s.sync, ...cambios } })),
  datosCambiaron: () => set((s) => ({ versionDatos: s.versionDatos + 1 })),
  fijarSuscripcion: (suscripcion) => set({ suscripcion }),
  fijarAvisoSalida: (avisoSalida) => set({ avisoSalida }),
}));
