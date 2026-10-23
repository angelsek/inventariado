/**
 * Menú lateral de la versión web (PC): grupos con un solo camino a cada pantalla.
 * Lógica pura (sin React Native) para poder probarla; la dibuja web/componentes/MarcoApp.web.tsx.
 */

import { type Permiso, PERMISOS } from '@/features/permisos/catalogo';
import { puedeAbrir } from '@/features/permisos/permisos';

export type EntradaMenu = {
  texto: string;
  /** Nombre de ícono de Ionicons. */
  icono: string;
  ruta: string;
  /** Rutas (además de `ruta`) en que la entrada queda marcada como activa. */
  activaEn: string[];
  /** Permiso extra, además del que pide la ruta (PERMISO_POR_RUTA). */
  permiso?: Permiso;
};

export type GrupoMenu = { titulo: string; entradas: EntradaMenu[] };

export const MENU: GrupoMenu[] = [
  {
    titulo: 'Caja',
    entradas: [
      { texto: 'Vender', icono: 'cart-outline', ruta: '/vender', activaEn: ['/cobrar'] },
      { texto: 'Caja del día', icono: 'cash-outline', ruta: '/caja', activaEn: [] },
      { texto: 'Ventas', icono: 'receipt-outline', ruta: '/ventas', activaEn: ['/venta'] },
    ],
  },
  {
    titulo: 'Inventario',
    entradas: [
      {
        texto: 'Productos',
        icono: 'cube-outline',
        ruta: '/inventario',
        activaEn: ['/producto', '/categorias', '/importar', '/reponer'],
      },
      {
        texto: 'Ingresos de mercadería',
        icono: 'download-outline',
        ruta: '/compra',
        activaEn: ['/compras', '/proveedores'],
      },
      {
        texto: 'Conteo de stock',
        icono: 'clipboard-outline',
        ruta: '/conteo',
        activaEn: [],
      },
    ],
  },
  {
    titulo: 'Clientes',
    entradas: [
      {
        texto: 'Clientes y fiado',
        icono: 'people-outline',
        ruta: '/clientes',
        activaEn: ['/cliente'],
      },
    ],
  },
  {
    titulo: 'Reportes',
    entradas: [
      {
        texto: 'Resumen de hoy',
        icono: 'home-outline',
        ruta: '/',
        activaEn: [],
        permiso: 'reportes',
      },
      {
        texto: 'Reportes',
        icono: 'bar-chart-outline',
        ruta: '/estadisticas',
        activaEn: [],
      },
    ],
  },
  {
    titulo: 'Configuración',
    entradas: [
      {
        texto: 'Datos del negocio',
        icono: 'storefront-outline',
        ruta: '/negocio',
        activaEn: [],
      },
      {
        texto: 'Usuarios y permisos',
        icono: 'person-circle-outline',
        ruta: '/usuarios',
        activaEn: ['/usuario'],
      },
      { texto: 'Suscripción', icono: 'card-outline', ruta: '/suscripcion', activaEn: [] },
      {
        // Exportar es del plan pagado, pero la entrada NO se filtra aquí: el candado lo
        // dibuja MarcoApp.web.tsx (features/suscripcion/planPagado.ts) y la pantalla
        // explica adentro cómo contratar. Filtrarla rompería el resaltado del menú.
        texto: 'Exportar datos',
        icono: 'share-outline',
        ruta: '/exportar',
        activaEn: [],
      },
      {
        texto: 'Cuenta y equipo',
        icono: 'settings-outline',
        ruta: '/mas',
        activaEn: ['/admin', '/reportes', '/comentario', '/legal', '/eliminar-cuenta'],
      },
    ],
  },
];

/** Menú según los permisos de la persona: sin las entradas que no puede abrir ni los grupos vacíos. */
export function menuParaPermisos(permisos: readonly Permiso[]): GrupoMenu[] {
  return MENU.map((grupo) => ({
    ...grupo,
    entradas: grupo.entradas.filter(
      (e) => puedeAbrir(e.ruta, permisos) && (!e.permiso || permisos.includes(e.permiso)),
    ),
  })).filter((grupo) => grupo.entradas.length > 0);
}

const segmentos = (ruta: string) => ruta.split('?')[0].split('/').filter(Boolean);

/** ¿`ruta` es `base` o está dentro de ella? Compara por segmentos: /compra no incluye /compras. */
function dentroDe(ruta: string, base: string): number | null {
  const r = segmentos(ruta);
  const b = segmentos(base);
  if (b.length === 0) return r.length === 0 ? 0 : null;
  if (b.length > r.length) return null;
  return b.every((s, i) => s === r[i]) ? b.length : null;
}

/** Entrada del menú que corresponde a `ruta` (la más específica), o null si no hay. */
export function entradaActiva(
  ruta: string,
  permisos: readonly Permiso[] = PERMISOS,
): EntradaMenu | null {
  let mejor: EntradaMenu | null = null;
  let largo = -1;
  for (const grupo of menuParaPermisos(permisos)) {
    for (const entrada of grupo.entradas) {
      for (const base of [entrada.ruta, ...entrada.activaEn]) {
        const coincide = dentroDe(ruta, base);
        if (coincide !== null && coincide > largo) {
          mejor = entrada;
          largo = coincide;
        }
      }
    }
  }
  return mejor;
}
