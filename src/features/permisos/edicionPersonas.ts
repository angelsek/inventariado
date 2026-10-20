import { GRUPOS_PERMISOS, type Permiso, PERMISOS, PERMISOS_INICIALES } from './catalogo';

/**
 * Reglas para editar personas y sus permisos (sin React ni base de datos, para poder
 * probarlas). Todo el negocio usa una sola cuenta de Supabase, así que se aplican en la
 * app: quien tiene "usuarios" no puede darle a nadie permisos que no tiene, no cambia
 * los suyos y no toca al dueño. El dueño siempre puede todo.
 */

export const LARGO_MAXIMO_NOMBRE = 40;

/** Quien edita: la persona que usa la app. */
export type Editor = { esDueno: boolean; perfilId: string; permisos: readonly Permiso[] };

/** La persona que se edita. */
export type Objetivo = { id: string; rol: string; permisos: readonly Permiso[] };

/** Qué puede cambiar el editor de una persona, y por qué no si no puede. */
export type Edicion = {
  nombre: boolean;
  pin: boolean;
  activo: boolean;
  permisos: boolean;
  motivo?: string;
};

const nada = (motivo: string): Edicion => ({
  nombre: false,
  pin: false,
  activo: false,
  permisos: false,
  motivo,
});

export function puedeEditarPersona(objetivo: Objetivo, editor: Editor): Edicion {
  const esYo = objetivo.id === editor.perfilId;
  if (objetivo.rol === 'dueno') {
    // El dueño tiene todos los permisos y no se desactiva; solo él cambia su nombre y PIN.
    return editor.esDueno
      ? { nombre: true, pin: true, activo: false, permisos: false }
      : nada('Solo el dueño puede cambiar sus datos.');
  }
  if (esYo) {
    return {
      nombre: false,
      pin: true,
      activo: false,
      permisos: false,
      motivo: 'No puedes cambiar tus propios permisos. Pídeselo al dueño.',
    };
  }
  if (!editor.esDueno && objetivo.permisos.some((p) => !editor.permisos.includes(p))) {
    return nada('Esta persona tiene permisos que tú no tienes.');
  }
  // Entre dos personas que administran usuarios, una no puede quitarle el acceso a la otra.
  if (!editor.esDueno && objetivo.permisos.includes('usuarios')) {
    return nada('Solo el dueño puede cambiar a quien administra usuarios.');
  }
  return { nombre: true, pin: true, activo: true, permisos: true };
}

/** ¿El editor puede activar o desactivar este permiso? */
export const permisoEditable = (permiso: Permiso, editor: Editor) =>
  editor.esDueno || editor.permisos.includes(permiso);

/** Permisos con que parte una persona nueva: los iniciales que el editor puede dar. */
export const permisosInicialesPara = (editor: Editor): Permiso[] =>
  PERMISOS_INICIALES.filter((p) => permisoEditable(p, editor));

/** Mensaje de error si se dan permisos que el editor no tiene, o null. */
export const validarPermisos = (permisos: readonly Permiso[], editor: Editor) =>
  permisos.every((p) => permisoEditable(p, editor))
    ? null
    : 'Solo puedes dar permisos que tú tienes.';

/** Quita espacios al inicio y al final y junta los repetidos. */
export const normalizarNombre = (nombre: string) => nombre.trim().replace(/\s+/g, ' ');

/** Mensaje de error del nombre, o null si sirve. */
export function validarNombre(nombre: string): string | null {
  const limpio = normalizarNombre(nombre);
  if (!limpio) return 'Ingresa el nombre de la persona.';
  if (limpio.length > LARGO_MAXIMO_NOMBRE) {
    return `El nombre puede tener hasta ${LARGO_MAXIMO_NOMBRE} letras.`;
  }
  return null;
}

/** Permisos sin repetir, sin claves desconocidas y en el orden del catálogo. */
export const ordenarPermisos = (permisos: readonly string[]): Permiso[] =>
  PERMISOS.filter((p) => permisos.includes(p));

/** Textos de los permisos de una persona, para ver de un vistazo qué puede hacer. */
export function resumirPermisos(perfil: { rol: string; permisos: readonly Permiso[] }): string {
  if (perfil.rol === 'dueno') return 'Todos los permisos';
  return (
    GRUPOS_PERMISOS.flatMap((g) => g.permisos)
      .filter((p) => perfil.permisos.includes(p.clave))
      .map((p) => p.texto)
      .join(' · ') || 'Solo ver productos'
  );
}
