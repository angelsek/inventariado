/**
 * Menú lateral de la versión web (PC): grupos con un solo camino a cada pantalla.
 * Lógica pura (sin React Native) para poder probarla; la dibuja web/componentes/MarcoApp.web.tsx.
 */

export type Rol = 'dueno' | 'cajero';

export type EntradaMenu = {
  texto: string;
  /** Nombre de ícono de Ionicons. */
  icono: string;
  ruta: string;
  /** Rutas (además de `ruta`) en que la entrada queda marcada como activa. */
  activaEn: string[];
  soloDueno?: boolean;
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
        soloDueno: true,
      },
      {
        texto: 'Conteo de stock',
        icono: 'clipboard-outline',
        ruta: '/conteo',
        activaEn: [],
        soloDueno: true,
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
      { texto: 'Resumen de hoy', icono: 'home-outline', ruta: '/', activaEn: [], soloDueno: true },
      {
        texto: 'Reportes',
        icono: 'bar-chart-outline',
        ruta: '/estadisticas',
        activaEn: [],
        soloDueno: true,
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
        soloDueno: true,
      },
      {
        texto: 'Usuarios y cajeros',
        icono: 'person-circle-outline',
        ruta: '/usuarios',
        activaEn: [],
        soloDueno: true,
      },
      { texto: 'Suscripción', icono: 'card-outline', ruta: '/suscripcion', activaEn: [] },
      {
        texto: 'Exportar datos',
        icono: 'share-outline',
        ruta: '/exportar',
        activaEn: [],
        soloDueno: true,
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

/** Menú que ve cada rol: el cajero no ve las entradas del dueño ni los grupos que quedan vacíos. */
export function menuParaRol(rol: Rol): GrupoMenu[] {
  return MENU.map((grupo) => ({
    ...grupo,
    entradas: grupo.entradas.filter((e) => rol === 'dueno' || !e.soloDueno),
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
export function entradaActiva(ruta: string, rol: Rol = 'dueno'): EntradaMenu | null {
  let mejor: EntradaMenu | null = null;
  let largo = -1;
  for (const grupo of menuParaRol(rol)) {
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

/**
 * Miga de pan de una pantalla: la entrada del menú de la que cuelga (p. ej. /producto/x →
 * Productos), o null si la ruta es la de una entrada del menú o no cuelga de ninguna.
 */
export function migaDe(ruta: string, rol: Rol = 'dueno'): EntradaMenu | null {
  const entrada = entradaActiva(ruta, rol);
  if (!entrada) return null;
  const propia = segmentos(entrada.ruta);
  const actual = segmentos(ruta);
  const esLaMisma = propia.length === actual.length && propia.every((s, i) => s === actual[i]);
  return esLaMisma ? null : entrada;
}
