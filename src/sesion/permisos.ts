import { useShallow } from 'zustand/react/shallow';

import type { Perfil } from '@/db/perfiles';
import type { Permiso } from '@/features/permisos/catalogo';
import { permisosDePerfil } from '@/features/permisos/permisos';

import { useSesion } from './store';

type EstadoPermisos = Pick<ReturnType<typeof useSesion.getState>, 'perfil'>;

/** Permisos de la persona que usa la app (ninguno si nadie ingresó su PIN). */
export const permisosDeSesion = ({ perfil }: EstadoPermisos): Permiso[] =>
  perfil ? permisosDePerfil(perfil) : [];

/** ¿La persona que usa la app tiene `permiso`? */
export function usePermiso(permiso: Permiso): boolean {
  return useSesion((s) => permisosDeSesion(s).includes(permiso));
}

/** Todos los permisos de la persona que usa la app. */
export function usePermisos(): Permiso[] {
  return useSesion(useShallow(permisosDeSesion));
}

/** Texto junto al nombre de una persona: "Dueño" para el dueño, nada para las demás. */
export const etiquetaPersona = (perfil: Pick<Perfil, 'rol'>): string =>
  perfil.rol === 'dueno' ? 'Dueño' : '';

/** Nombre de la persona que usa la app, con " · Dueño" si corresponde. */
export function useNombreConEtiqueta(): string {
  return useSesion((s) => {
    if (!s.perfil) return '';
    const etiqueta = etiquetaPersona(s.perfil);
    return etiqueta ? `${s.perfil.nombre} · ${etiqueta}` : s.perfil.nombre;
  });
}
