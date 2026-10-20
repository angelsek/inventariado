import type { Permiso } from '@/features/permisos/catalogo';

/** Una persona que solo cobra y consulta (lo que antes era el rol Cajero). */
export const PERMISOS_CAJERO: Permiso[] = ['vender', 'ventas_ver', 'caja', 'fiado'];
