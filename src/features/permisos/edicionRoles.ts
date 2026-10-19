import type { Rol } from '@/db/roles';

import { GRUPOS_PERMISOS, type Permiso, PERMISOS, ROLES_PREDEFINIDOS } from './catalogo';

/**
 * Reglas del editor de roles (sin React ni base de datos, para poder probarlas).
 * Todo el negocio usa una sola cuenta de Supabase, así que estas reglas se aplican
 * en la app: quien tiene "usuarios" no puede darse a sí mismo ni a otros permisos
 * que no tiene. El dueño siempre puede todo.
 */

export const LARGO_MAXIMO_NOMBRE_ROL = 40;

/** Quien edita: el dueño, o una persona con su rol y sus permisos. */
export type Editor = { esDueno: boolean; rolId: string | null; permisos: readonly Permiso[] };

/** Quita espacios al inicio y al final y junta los repetidos. */
export const normalizarNombreRol = (nombre: string) => nombre.trim().replace(/\s+/g, ' ');

// En JS y no con lower() de SQLite, que no pasa la Ñ ni las tildes a minúscula.
const clave = (nombre: string) => normalizarNombreRol(nombre).toLocaleLowerCase('es-CL');

const RESERVADOS = ['dueño', 'dueno'];

/** Mensaje de error del nombre, o null si sirve. `idActual` es el rol que se edita. */
export function validarNombreRol(
  nombre: string,
  roles: readonly Pick<Rol, 'id' | 'nombre' | 'eliminado'>[],
  idActual: string | null,
): string | null {
  const limpio = normalizarNombreRol(nombre);
  if (!limpio) return 'Ingresa el nombre del rol.';
  if (limpio.length > LARGO_MAXIMO_NOMBRE_ROL) {
    return `El nombre puede tener hasta ${LARGO_MAXIMO_NOMBRE_ROL} letras.`;
  }
  if (RESERVADOS.includes(clave(limpio))) return 'Ese nombre está reservado para el dueño.';
  const repetido = roles.find(
    (r) => !r.eliminado && r.id !== idActual && clave(r.nombre) === clave(limpio),
  );
  return repetido ? `Ya existe un rol llamado "${repetido.nombre}".` : null;
}

/** Permisos sin repetir, sin claves desconocidas y en el orden del catálogo. */
export const ordenarPermisos = (permisos: readonly string[]): Permiso[] =>
  PERMISOS.filter((p) => permisos.includes(p));

const incluidos = (permisos: readonly Permiso[], editor: Editor) =>
  editor.esDueno || permisos.every((p) => editor.permisos.includes(p));

/** ¿El editor puede activar o desactivar este permiso? */
export const permisoEditable = (permiso: Permiso, editor: Editor) =>
  editor.esDueno || editor.permisos.includes(permiso);

/**
 * ¿El editor puede cambiar este rol? Nadie más que el dueño cambia su propio rol
 * (no se puede dar más permisos) ni un rol con permisos que el editor no tiene.
 */
export function puedeEditarRol(
  rol: Pick<Rol, 'id' | 'permisos'>,
  editor: Editor,
): { editable: boolean; motivo?: string } {
  if (editor.esDueno) return { editable: true };
  if (rol.id === editor.rolId) {
    return { editable: false, motivo: 'No puedes cambiar tu propio rol. Pídeselo al dueño.' };
  }
  if (!incluidos(rol.permisos, editor)) {
    return { editable: false, motivo: 'Este rol tiene permisos que tú no tienes.' };
  }
  return { editable: true };
}

/** ¿Puede devolver un rol predefinido a sus permisos de fábrica? */
export function puedeRestablecer(
  rol: Pick<Rol, 'id' | 'permisos' | 'predefinido'>,
  editor: Editor,
) {
  if (!rol.predefinido || !puedeEditarRol(rol, editor).editable) return false;
  return incluidos(ROLES_PREDEFINIDOS[rol.predefinido].permisos, editor);
}

/** Roles que el editor puede asignar a otra persona: solo los que no le dan más que él. */
export const rolesAsignables = <R extends Pick<Rol, 'permisos'>>(
  roles: readonly R[],
  editor: Editor,
) => roles.filter((r) => incluidos(r.permisos, editor));

/** Textos de los permisos de un rol, para ver de un vistazo qué puede hacer. */
export const resumirPermisos = (rol: Pick<Rol, 'permisos'>) =>
  GRUPOS_PERMISOS.flatMap((g) => g.permisos)
    .filter((p) => rol.permisos.includes(p.clave))
    .map((p) => p.texto)
    .join(' · ') || 'Solo ver productos';

/**
 * Editor a partir de la persona que usa la app. Si su rol no está entre los vigentes
 * (sin rol o eliminado), su rol real es el Cajero: tampoco puede cambiarlo.
 */
export function editorDe(
  perfil: { rol: string; rol_id: string | null },
  roles: readonly Pick<Rol, 'id' | 'predefinido'>[],
  permisos: readonly Permiso[],
): Editor {
  const vigente = roles.some((r) => r.id === perfil.rol_id);
  return {
    esDueno: perfil.rol === 'dueno',
    rolId: vigente ? perfil.rol_id : (roles.find((r) => r.predefinido === 'cajero')?.id ?? null),
    permisos,
  };
}
