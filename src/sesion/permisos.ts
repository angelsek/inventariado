import { useShallow } from 'zustand/react/shallow';

import type { Perfil } from '@/db/perfiles';
import { obtenerRol } from '@/db/roles';
import type { BaseLocal } from '@/db/tipos';
import type { Permiso } from '@/features/permisos/catalogo';
import { permisosDePerfil } from '@/features/permisos/permisos';

import { type RolSesion, useSesion } from './store';

type EstadoPermisos = Pick<ReturnType<typeof useSesion.getState>, 'perfil' | 'rol'>;

/** Permisos de la persona que usa la app (ninguno si nadie ingresó su PIN). */
export const permisosDeSesion = ({ perfil, rol }: EstadoPermisos): Permiso[] =>
  perfil ? permisosDePerfil(perfil, rol) : [];

/** ¿La persona que usa la app tiene `permiso`? */
export function usePermiso(permiso: Permiso): boolean {
  return useSesion((s) => permisosDeSesion(s).includes(permiso));
}

/** Todos los permisos de la persona que usa la app. */
export function usePermisos(): Permiso[] {
  return useSesion(useShallow(permisosDeSesion));
}

/** Nombre que se muestra junto al de la persona: "Dueño", su rol o "Cajero". */
export function nombreDeRol(perfil: Pick<Perfil, 'rol'>, rol: RolSesion | null): string {
  if (perfil.rol === 'dueno') return 'Dueño';
  return rol && !rol.eliminado ? rol.nombre : 'Cajero';
}

export function useNombreRol(): string {
  return useSesion((s) => (s.perfil ? nombreDeRol(s.perfil, s.rol) : ''));
}

/** Lee de la base local el rol del perfil para guardarlo en la sesión. */
export async function cargarRolSesion(db: BaseLocal, perfil: Perfil): Promise<RolSesion | null> {
  if (perfil.rol === 'dueno' || !perfil.rol_id) return null;
  const rol = await obtenerRol(db, perfil.rol_id);
  return rol ? { nombre: rol.nombre, permisos: rol.permisos, eliminado: rol.eliminado } : null;
}
