import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearProducto, obtenerProducto, type Producto } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
import {
  anularVenta,
  listarVentas,
  obtenerVenta,
  registrarVenta,
  resumirVentas,
} from '@/db/ventas';
import type { ItemCarrito } from '@/features/ventas/calculos';
import { textoComprobante } from '@/features/ventas/comprobante';
import { rangoDelDia } from '@/lib/fechas';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';
const AUTOR = { perfilId: 'perfil-1', dispositivoId: 'disp-1' };

let db: BaseLocal;
let cerveza: Producto;
let queso: Producto;

const comoItem = (p: Producto, cantidad: number, descuento = 0): ItemCarrito => ({
  clave: p.id,
  productoId: p.id,
  nombre: p.nombre,
  unidad: p.unidad,
  cantidad,
  precioUnitario: p.precioVenta,
  costoUnitario: p.costo,
  descuento,
  stock: p.stock,
});

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  const base = { codigoBarras: null, categoriaId: null, stockMinimo: 0 };
  const idCerveza = await crearProducto(
    db,
    NEGOCIO,
    { ...base, nombre: 'Cerveza lata', precioVenta: 1290, costo: 800, unidad: 'unidad' },
    24,
    AUTOR,
  );
  const idQueso = await crearProducto(
    db,
    NEGOCIO,
    { ...base, nombre: 'Queso gauda', precioVenta: 9990, costo: 7000, unidad: 'kg' },
    3,
    AUTOR,
  );
  cerveza = (await obtenerProducto(db, idCerveza))!;
  queso = (await obtenerProducto(db, idQueso))!;
});

async function venderEjemplo() {
  const libre: ItemCarrito = {
    clave: 'libre-1',
    productoId: null,
    nombre: 'Pan',
    unidad: 'unidad',
    cantidad: 1,
    precioUnitario: 1000,
    costoUnitario: 0,
    descuento: 0,
    stock: null,
  };
  return registrarVenta(db, {
    negocioId: NEGOCIO,
    items: [comoItem(cerveza, 2), comoItem(queso, 0.5, 95), libre],
    descuentoGeneral: 0,
    pagos: [
      { medio: 'debito', monto: 3000 },
      { medio: 'efectivo', monto: 5480 },
    ],
    efectivoRecibido: 10000,
    vuelto: 4520,
    autor: AUTOR,
  });
}

it('registra la venta, descuenta stock y guarda copia de precios', async () => {
  const id = await venderEjemplo();

  expect((await obtenerProducto(db, cerveza.id))?.stock).toBe(22);
  expect((await obtenerProducto(db, queso.id))?.stock).toBe(2.5);

  const venta = await obtenerVenta(db, id);
  expect(venta).toMatchObject({
    subtotal: 8480,
    descuento: 0,
    total: 8480,
    estado: 'completada',
    vuelto: 4520,
  });
  expect(venta?.items.map((i) => [i.nombre, i.cantidad, i.total])).toEqual([
    ['Cerveza lata', 2, 2580],
    ['Queso gauda', 0.5, 4900],
    ['Pan', 1, 1000],
  ]);
  expect(venta?.pagos).toEqual([
    { medio: 'debito', monto: 3000 },
    { medio: 'efectivo', monto: 5480 },
  ]);

  const pendientes = await db.getFirstAsync<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM ventas WHERE pendiente > 0) +
            (SELECT COUNT(*) FROM venta_items WHERE pendiente > 0) +
            (SELECT COUNT(*) FROM pagos WHERE pendiente > 0) AS n`,
  );
  expect(pendientes?.n).toBe(1 + 3 + 2);
});

it('anular devuelve el stock una sola vez y saca la venta del resumen', async () => {
  const id = await venderEjemplo();
  const hoy = rangoDelDia(new Date());

  expect(await resumirVentas(db, NEGOCIO, hoy.desde, hoy.hasta)).toEqual({
    cantidad: 1,
    total: 8480,
    porMedio: { efectivo: 5480, debito: 3000, credito: 0, transferencia: 0 },
  });

  await anularVenta(db, id, 'Cliente se arrepintió', AUTOR);
  await anularVenta(db, id, 'Doble toque', AUTOR);

  expect((await obtenerProducto(db, cerveza.id))?.stock).toBe(24);
  expect((await obtenerProducto(db, queso.id))?.stock).toBe(3);
  expect(await obtenerVenta(db, id)).toMatchObject({
    estado: 'anulada',
    motivoAnulacion: 'Cliente se arrepintió',
  });
  expect((await resumirVentas(db, NEGOCIO, hoy.desde, hoy.hasta)).total).toBe(0);

  const [resumen] = await listarVentas(db, NEGOCIO, hoy.desde, hoy.hasta);
  expect(resumen).toMatchObject({ estado: 'anulada', cantidadItems: 3 });
  expect(resumen.medios.sort()).toEqual(['debito', 'efectivo']);
});

it('no registra una venta vacía', async () => {
  await expect(
    registrarVenta(db, {
      negocioId: NEGOCIO,
      items: [],
      descuentoGeneral: 0,
      pagos: [],
      efectivoRecibido: null,
      vuelto: null,
      autor: AUTOR,
    }),
  ).rejects.toThrow('no tiene productos');
});

it('arma el texto del comprobante', async () => {
  const venta = (await obtenerVenta(db, await venderEjemplo()))!;
  const texto = textoComprobante('Botillería Ana', venta);

  expect(texto).toContain('Botillería Ana');
  expect(texto).toContain('2 x Cerveza lata  $2.580');
  expect(texto).toContain('0,5 x Queso gauda  $4.900');
  expect(texto).toContain('TOTAL: $8.480');
  expect(texto).toContain('Recibido: $10.000 · Vuelto: $4.520');
  expect(texto).toContain('no válido como boleta');
});
