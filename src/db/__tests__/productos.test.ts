import { crearCategoria, eliminarCategoria } from '@/db/categorias';
import { migrarBaseDeDatos } from '@/db/migraciones';
import {
  cambiarActivoProducto,
  crearProducto,
  type DatosProducto,
  listarProductos,
  obtenerProducto,
  registrarMovimiento,
} from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';
const AUTOR = { perfilId: 'perfil-1', dispositivoId: 'disp-1' };

const datos = (cambios: Partial<DatosProducto>): DatosProducto => ({
  nombre: 'Producto',
  codigoBarras: null,
  categoriaId: null,
  precioVenta: 1000,
  costo: 500,
  stockMinimo: 0,
  unidad: 'unidad',
  ...cambios,
});

let db: BaseLocal;
beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
});

it('el stock es la suma de los movimientos', async () => {
  const id = await crearProducto(db, NEGOCIO, datos({ nombre: 'Pisco 35°' }), 10, AUTOR);
  await registrarMovimiento(db, {
    negocioId: NEGOCIO,
    productoId: id,
    tipo: 'venta',
    cantidad: -3,
    autor: AUTOR,
  });
  expect((await obtenerProducto(db, id))?.stock).toBe(7);

  const movimientos = await db.getAllAsync<{ tipo: string; pendiente: number }>(
    'SELECT tipo, pendiente FROM movimientos_stock ORDER BY creado_en',
  );
  expect(movimientos.map((m) => m.tipo).sort()).toEqual(['inicial', 'venta']);
  expect(movimientos.every((m) => m.pendiente === 1)).toBe(true);
});

it('sin stock inicial no crea movimiento', async () => {
  await crearProducto(db, NEGOCIO, datos({}), 0, AUTOR);
  const fila = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM movimientos_stock');
  expect(fila?.n).toBe(0);
});

it('busca por palabras en cualquier orden y por código de barras', async () => {
  await crearProducto(db, NEGOCIO, datos({ nombre: 'Cerveza Escudo lata 470' }), 0, AUTOR);
  await crearProducto(
    db,
    NEGOCIO,
    datos({ nombre: 'Coca-Cola 1,5L', codigoBarras: '7801610001196' }),
    0,
    AUTOR,
  );

  const nombres = async (busqueda: string) =>
    (await listarProductos(db, NEGOCIO, { busqueda })).map((p) => p.nombre);

  expect(await nombres('lata escudo')).toEqual(['Cerveza Escudo lata 470']);
  expect(await nombres('coca')).toEqual(['Coca-Cola 1,5L']);
  expect(await nombres('0001196')).toEqual(['Coca-Cola 1,5L']);
  expect(await nombres('pisco')).toEqual([]);
});

it('filtra por categoría y oculta inactivos salvo que se pidan', async () => {
  const cervezas = await crearCategoria(db, NEGOCIO, 'Cervezas');
  const id = await crearProducto(
    db,
    NEGOCIO,
    datos({ nombre: 'Lager', categoriaId: cervezas.id }),
    0,
    AUTOR,
  );
  await crearProducto(db, NEGOCIO, datos({ nombre: 'Pan' }), 0, AUTOR);

  expect(
    (await listarProductos(db, NEGOCIO, { categoriaId: cervezas.id })).map((p) => p.nombre),
  ).toEqual(['Lager']);

  await cambiarActivoProducto(db, id, false);
  expect((await listarProductos(db, NEGOCIO)).map((p) => p.nombre)).toEqual(['Pan']);
  expect(await listarProductos(db, NEGOCIO, { incluirInactivos: true })).toHaveLength(2);
});

it('crearCategoria no duplica nombres y eliminarla deja productos sin categoría', async () => {
  const a = await crearCategoria(db, NEGOCIO, 'Vinos');
  const b = await crearCategoria(db, NEGOCIO, ' vinos ');
  expect(b.id).toBe(a.id);

  const id = await crearProducto(db, NEGOCIO, datos({ categoriaId: a.id }), 0, AUTOR);
  await eliminarCategoria(db, a.id);
  expect(await obtenerProducto(db, id)).toMatchObject({ categoriaId: null, categoria: null });
});
