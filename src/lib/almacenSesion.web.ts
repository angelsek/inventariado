/**
 * Web (PC): la sesión de Supabase queda en el localStorage del sitio, lo normal en
 * supabase-js para navegador. Se borra al desvincular o cerrar sesión, como en el teléfono.
 */
export const almacenSesion = {
  getItem: (clave: string) => globalThis.localStorage?.getItem(clave) ?? null,
  setItem: (clave: string, valor: string) => globalThis.localStorage?.setItem(clave, valor),
  removeItem: (clave: string) => globalThis.localStorage?.removeItem(clave),
};
