import { type Permiso, PERMISOS, ROLES_PREDEFINIDOS } from './catalogo';

/**
 * Lógica pura de permisos (sin React ni base de datos) para poder probarla.
 * El dueño siempre tiene todo. Una persona sin rol, o con un rol eliminado,
 * tiene los permisos del Cajero: así una APK vieja o un equipo que aún no
 * sincroniza nunca muestran más de la cuenta.
 */

export const esPermiso = (valor: unknown): valor is Permiso =>
  typeof valor === 'string' && (PERMISOS as readonly string[]).includes(valor);

/** Lee la columna `permisos` (JSON) ignorando claves desconocidas o repetidas. */
export function parsearPermisos(valor: unknown): Permiso[] {
  let lista: unknown = valor;
  if (typeof valor === 'string') {
    try {
      lista = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return PERMISOS.filter((p) => lista.includes(p));
}

export function permisosDePerfil(
  perfil: { rol: string },
  rol: { permisos: readonly Permiso[]; eliminado: boolean } | null,
): Permiso[] {
  if (perfil.rol === 'dueno') return [...PERMISOS];
  if (!rol || rol.eliminado) return [...ROLES_PREDEFINIDOS.cajero.permisos];
  return PERMISOS.filter((p) => rol.permisos.includes(p));
}

/**
 * Permisos que pide cada ruta (basta con uno de la lista). Las rutas que no
 * están aquí las ve cualquier persona. Lo usan el layout raíz, las pestañas y
 * el menú web, para que una pantalla no se abra escribiendo su dirección.
 */
export const PERMISO_POR_RUTA: Record<string, readonly Permiso[]> = {
  '/vender': ['vender'],
  '/cobrar': ['vender'],
  '/caja': ['caja'],
  '/ventas': ['ventas_ver'],
  // El detalle de una venta lo ve también quien vende: es el comprobante al cobrar.
  '/venta': ['ventas_ver', 'vender'],
  '/clientes': ['fiado', 'clientes_editar'],
  '/cliente': ['fiado', 'clientes_editar'],
  '/categorias': ['productos_editar'],
  '/importar': ['productos_editar'],
  '/compra': ['mercaderia'],
  '/compras': ['mercaderia'],
  '/proveedores': ['mercaderia'],
  '/conteo': ['stock'],
  '/reponer': ['stock'],
  '/estadisticas': ['reportes'],
  '/exportar': ['exportar'],
  '/negocio': ['negocio'],
  '/usuarios': ['usuarios'],
  '/eliminar-cuenta': ['cuenta_eliminar'],
};

/** ¿Los `permisos` alcanzan para abrir `ruta`? Compara el primer segmento. */
export function puedeAbrir(ruta: string, permisos: readonly Permiso[]): boolean {
  const base = '/' + (ruta.split('?')[0].split('/').filter(Boolean)[0] ?? '');
  const pide = PERMISO_POR_RUTA[base];
  return !pide || pide.some((p) => permisos.includes(p));
}
