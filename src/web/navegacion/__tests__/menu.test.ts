import { type Permiso, PERMISOS, PERMISOS_INICIALES } from '@/features/permisos/catalogo';

import { requierePlanPagado } from '@/features/suscripcion/planPagado';

import { entradaActiva, MENU, menuParaPermisos } from '../menu';

const CAJERO = PERMISOS_INICIALES;
const BODEGUERO: Permiso[] = ['productos_editar', 'mercaderia', 'stock'];

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

it('quien parte con los permisos iniciales ve caja, consulta e inventario, sin entradas del dueño', () => {
  expect(textos(CAJERO)).toEqual([
    'Vender',
    'Caja del día',
    'Ventas',
    'Productos',
    'Ingresos de mercadería',
    'Conteo de stock',
    'Clientes y fiado',
    'Suscripción',
    'Cuenta y equipo',
  ]);
  expect(menuParaPermisos(CAJERO).map((g) => g.titulo)).not.toContain('Reportes');
});

it('una persona solo con inventario ve el inventario, sin caja, ventas ni clientes', () => {
  expect(textos(BODEGUERO)).toEqual([
    'Productos',
    'Ingresos de mercadería',
    'Conteo de stock',
    'Suscripción',
    'Cuenta y equipo',
  ]);
});

it('sin ningún permiso solo se ven las entradas libres', () => {
  expect(textos([])).not.toContain('Vender');
  expect(textos([])).toContain('Productos');
  expect(textos([])).toContain('Cuenta y equipo');
});

it('quien no tiene "vender" no ve "Vender"', () => {
  expect(textos(CAJERO.filter((p) => p !== 'vender'))).not.toContain('Vender');
  expect(textos(CAJERO)).toContain('Vender');
});

it('"Usuarios y permisos" aparece con "usuarios" y no sin él', () => {
  expect(textos(['usuarios'])).toContain('Usuarios y permisos');
  expect(textos(PERMISOS)).toContain('Usuarios y permisos');
  expect(textos(CAJERO)).not.toContain('Usuarios y permisos');
  expect(textos(BODEGUERO)).not.toContain('Usuarios y permisos');
  expect(textos(['reportes'])).not.toContain('Usuarios y permisos');
});

it('ya no existe la entrada "Roles"', () => {
  expect(textos(PERMISOS)).not.toContain('Roles');
  expect(entradaActiva('/roles')?.texto).not.toBe('Roles');
});

it('/usuarios y /usuario/x marcan la entrada "Usuarios y permisos"', () => {
  expect(entradaActiva('/usuarios')?.texto).toBe('Usuarios y permisos');
  expect(entradaActiva('/usuario/abc')?.texto).toBe('Usuarios y permisos');
  expect(entradaActiva('/usuario/nuevo')?.texto).toBe('Usuarios y permisos');
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

it('una ruta de una entrada que la persona no ve no marca nada para ella', () => {
  expect(entradaActiva('/estadisticas', CAJERO)).toBeNull();
  expect(entradaActiva('/estadisticas', PERMISOS)?.texto).toBe('Reportes');
});

it('menuParaPermisos no oculta "Exportar datos" y entradaActiva("/exportar") la devuelve', () => {
  expect(textos(PERMISOS)).toContain('Exportar datos');
  expect(entradaActiva('/exportar', PERMISOS)?.texto).toBe('Exportar datos');
  expect(entradaActiva('/exportar')?.texto).toBe('Exportar datos');
});

it('la regla del candado: /exportar pide plan pagado y /estadisticas no (el candado lo dibuja MarcoApp.web.tsx)', () => {
  expect(requierePlanPagado('/exportar')).toBe(true);
  expect(requierePlanPagado('/estadisticas')).toBe(false);
});
