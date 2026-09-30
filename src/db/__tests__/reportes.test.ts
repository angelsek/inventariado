import { crearCategoria } from '@/db/categorias';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import { crearProducto, obtenerProducto, type Producto } from '@/db/productos';
import { generarReporte, valorizarInventario } from '@/db/reportes';
import type { BaseLocal } from '@/db/tipos';
import { anularVenta, registrarVenta } from '@/db/ventas';
import { csvReporte } from '@/features/reportes/csv';
import { calcularPeriodo } from '@/features/reportes/periodo';
import type { ItemCarrito, MedioPago } from '@/features/ventas/calculos';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';

let db: BaseLocal;
let cerveza: Producto;
let queso: Producto;
let pisco: Producto;
let carla: string;
let pedro: string;

const item = (p: Producto, cantidad: number): ItemCarrito => ({
  clave: p.id,
  productoId: p.id,
  nombre: p.nombre,
  unidad: p.unidad,
  cantidad,
  precioUnitario: p.precioVenta,
  costoUnitario: p.costo,
  descuento: 0,
  stock: p.stock,
});

/** Registra una venta y la mueve a la fecha indicada. */
async function vender(
  fecha: Date,
  perfilId: string,
  items: ItemCarrito[],
  medio: MedioPago = 'efectivo',
) {
  const total = items.reduce((s, i) => s + Math.round(i.cantidad * i.precioUnitario), 0);
  const id = await registrarVenta(db, {
    negocioId: NEGOCIO,
    items,
    descuentoGeneral: 0,
    pagos: [{ medio, monto: total }],
    efectivoRecibido: null,
    vuelto: null,
    autor: { perfilId, dispositivoId: 'disp-1' },
  });
  await db.runAsync('UPDATE ventas SET creado_en = ? WHERE id = ?', fecha.toISOString(), id);
  return id;
}

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  const bebidas = await crearCategoria(db, NEGOCIO, 'Bebidas');
  const autor = { perfilId: null, dispositivoId: 'disp-1' };
  const base = { codigoBarras: null, stockMinimo: 0, unidad: 'unidad' as const };
  const crear = async (datos: object, stock: number) =>
    (await obtenerProducto(
      db,
      await crearProducto(
        db,
        NEGOCIO,
        { ...base, categoriaId: null, ...datos } as never,
        stock,
        autor,
      ),
    ))!;
  cerveza = await crear(
    { nombre: 'Cerveza lata', precioVenta: 1000, costo: 600, categoriaId: bebidas.id },
    50,
  );
  queso = await crear({ nombre: 'Queso gauda', precioVenta: 10000, costo: 0, unidad: 'kg' }, 4);
  pisco = await crear({ nombre: 'Pisco 35°', precioVenta: 6000, costo: 5700 }, 3);
  carla = (
    await crearPerfil(db, { negocioId: NEGOCIO, nombre: 'Carla', rol: 'cajero', pin: '1111' })
  ).id;
  pedro = (
    await crearPerfil(db, { negocioId: NEGOCIO, nombre: 'Pedro', rol: 'dueno', pin: '2222' })
  ).id;
});

it('resume las ventas de la semana: totales, ganancia, días, horas, cajeros y categorías', async () => {
  // Semana del lunes 12 al domingo 18 de octubre de 2026.
  await vender(new Date(2026, 9, 12, 10), carla, [item(cerveza, 3)]); // 3.000
  await vender(new Date(2026, 9, 12, 19), pedro, [item(cerveza, 2), item(queso, 0.5)], 'debito'); // 7.000
  await vender(new Date(2026, 9, 14, 19, 30), carla, [item(cerveza, 1)]); // 1.000
  const anulada = await vender(new Date(2026, 9, 14, 20), carla, [item(cerveza, 5)]);
  await anularVenta(db, anulada, 'error', { perfilId: pedro, dispositivoId: 'disp-1' });
  // Semana anterior (para comparar) y fuera de rango.
  await vender(new Date(2026, 9, 6, 12), carla, [item(cerveza, 4)]); // 4.000
  await vender(new Date(2026, 9, 20, 12), carla, [item(cerveza, 9)]);

  const semana = calcularPeriodo('semana', new Date(2026, 9, 15));
  const r = await generarReporte(db, NEGOCIO, semana, new Date(2026, 10, 1));

  expect(r).toMatchObject({
    total: 11000,
    cantidad: 3,
    ticketPromedio: 3667,
    // Costo: 6 cervezas × 600 = 3.600; el queso no tiene costo.
    ganancia: 7400,
    itemsSinCosto: 1,
    anuladas: { cantidad: 1, monto: 5000 },
    anterior: { total: 4000, cantidad: 1 },
    porMedio: { efectivo: 4000, debito: 7000, credito: 0, transferencia: 0, fiado: 0 },
  });
  expect(r.porDia).toHaveLength(7);
  expect(r.porDia.map((d) => d.monto)).toEqual([10000, 0, 1000, 0, 0, 0, 0]);
  expect(r.porHora).toEqual([
    { hora: 10, monto: 3000, cantidad: 1 },
    { hora: 19, monto: 8000, cantidad: 2 },
  ]);
  expect(r.porCajero).toEqual([
    { nombre: 'Pedro', monto: 7000, cantidad: 1 },
    { nombre: 'Carla', monto: 4000, cantidad: 2 },
  ]);
  expect(r.porCategoria).toEqual([
    { nombre: 'Bebidas', monto: 6000, cantidad: 6 },
    { nombre: 'Sin categoría', monto: 5000, cantidad: 0.5 },
  ]);
  expect(r.productos.map((p) => [p.nombre, p.cantidad, p.monto, p.ganancia])).toEqual([
    ['Cerveza lata', 6, 6000, 2400],
    ['Queso gauda', 0.5, 5000, 5000],
  ]);
  // El pisco tiene stock y no se vendió: queda como mercadería parada.
  expect(r.sinVentas).toEqual([{ id: pisco.id, nombre: 'Pisco 35°', stock: 3, valorCosto: 17100 }]);

  const csv = csvReporte(r, 'Semana');
  expect(csv).toContain('Producto;Cerveza lata;6;6000;2400');
  expect(csv).toContain('Por cajero;Pedro;1;7000;');
});

it('si el período está en curso, compara con el mismo tramo del período anterior', async () => {
  await vender(new Date(2026, 9, 14, 9), carla, [item(cerveza, 1)]); // ayer a las 9
  await vender(new Date(2026, 9, 14, 18), carla, [item(cerveza, 5)]); // ayer a las 18
  await vender(new Date(2026, 9, 15, 9), carla, [item(cerveza, 2)]); // hoy a las 9

  const ahora = new Date(2026, 9, 15, 12);
  const r = await generarReporte(db, NEGOCIO, calcularPeriodo('dia', ahora), ahora);
  expect(r.total).toBe(2000);
  // Hasta las 12 de ayer solo se había vendido 1 cerveza.
  expect(r.anterior).toEqual({ total: 1000, cantidad: 1 });
  expect(r.porDia).toEqual([]);
});

it('valoriza el inventario y ordena por margen', async () => {
  const inv = await valorizarInventario(db, NEGOCIO);
  expect(inv).toMatchObject({
    // 50 × 600 + 4 × 0 + 3 × 5.700
    valorCosto: 47100,
    // 50 × 1.000 + 4 × 10.000 + 3 × 6.000
    valorVenta: 108000,
    productosConStock: 3,
    stockNegativo: 0,
    sinCosto: 1,
  });
  expect(inv.productos.map((p) => [p.nombre, p.margen])).toEqual([
    ['Pisco 35°', 0.05],
    ['Cerveza lata', 0.4],
    ['Queso gauda', null],
  ]);
});
