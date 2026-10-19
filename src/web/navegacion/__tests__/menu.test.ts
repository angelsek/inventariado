import { type Permiso, PERMISOS, ROLES_PREDEFINIDOS } from '@/features/permisos/catalogo';

import { entradaActiva, MENU, menuParaPermisos } from '../menu';

const CAJERO = ROLES_PREDEFINIDOS.cajero.permisos;
const BODEGUERO = ROLES_PREDEFINIDOS.bodeguero.permisos;

const textos = (permisos: readonly Permiso[]) =>
  menuParaPermisos(permisos).flatMap((g) => g.entradas.map((e) => e.texto));

it('el dueño ve todo el menú, agrupado', () => {
  expect(menuParaPermisos(PERMISOS).map((g) => g.titulo)).toEqual([
    'Caja',
    'Inventario',
    'Clientes',
    'Reportes',
    'Configuración',
  ]);
  expect(textos(PERMISOS)).toHaveLength(MENU.flatMap((g) => g.entradas).length);
});

it('el cajero ve la caja y la consulta, sin entradas del dueño ni grupos vacíos', () => {
  expect(textos(CAJERO)).toEqual([
    'Vender',
    'Caja del día',
    'Ventas',
    'Productos',
    'Clientes y fiado',
    'Suscripción',
    'Cuenta y equipo',
  ]);
  expect(menuParaPermisos(CAJERO).map((g) => g.titulo)).not.toContain('Reportes');
});

it('el bodeguero ve el inventario, sin caja, ventas ni clientes', () => {
  expect(textos(BODEGUERO)).toEqual([
    'Productos',
    'Ingresos de mercadería',
    'Conteo de stock',
    'Suscripción',
    'Cuenta y equipo',
  ]);
});

it('no repite destinos: cada ruta aparece una sola vez en el menú', () => {
  const rutas = MENU.flatMap((g) => g.entradas.flatMap((e) => [e.ruta, ...e.activaEn]));
  expect(new Set(rutas).size).toBe(rutas.length);
});

it.each([
  ['/vender', 'Vender'],
  ['/cobrar', 'Vender'],
  ['/ventas', 'Ventas'],
  ['/venta/abc', 'Ventas'],
  ['/compra', 'Ingresos de mercadería'],
  ['/compras', 'Ingresos de mercadería'],
  ['/proveedores', 'Ingresos de mercadería'],
  ['/producto/nuevo', 'Productos'],
  ['/reponer', 'Productos'],
  ['/categorias', 'Productos'],
  ['/importar', 'Productos'],
  ['/cliente/123', 'Clientes y fiado'],
  ['/', 'Resumen de hoy'],
  ['/legal/terminos', 'Cuenta y equipo'],
  ['/admin', 'Cuenta y equipo'],
  ['/reportes', 'Cuenta y equipo'],
])('la ruta %s marca la entrada "%s"', (ruta, texto) => {
  expect(entradaActiva(ruta)?.texto).toBe(texto);
});

it('una ruta de una entrada que el cajero no ve no marca nada para él', () => {
  expect(entradaActiva('/conteo', CAJERO)).toBeNull();
  expect(entradaActiva('/conteo', PERMISOS)?.texto).toBe('Conteo de stock');
});
