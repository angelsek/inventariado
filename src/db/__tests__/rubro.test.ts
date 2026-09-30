import { abrirCaja, obtenerCajaAbierta, resumirCaja } from '@/db/cajas';
import { crearCategoria, listarCategorias } from '@/db/categorias';
import {
  crearCliente,
  listarMovimientosCliente,
  obtenerCliente,
  registrarAbono,
  revisarLimite,
  totalFiado,
} from '@/db/clientes';
import { registrarCompra } from '@/db/compras';
import { migrarBaseDeDatos } from '@/db/migraciones';
import {
  actualizarProducto,
  ajustarStock,
  crearProducto,
  obtenerProducto,
  type Producto,
} from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
import { anularVenta, obtenerVenta, registrarVenta } from '@/db/ventas';
import { descuentoPromo, type ItemCarrito, totalItem } from '@/features/ventas/calculos';
import { useCarrito } from '@/features/ventas/carrito';
import { textoComprobante } from '@/features/ventas/comprobante';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';
const AUTOR = { perfilId: 'perfil-1', dispositivoId: 'disp-1' };
const base = { codigoBarras: null, categoriaId: null, stockMinimo: 0, unidad: 'unidad' as const };

let db: BaseLocal;
let lata: Producto;
let sixPack: Producto;

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
  promo: p.promoCantidad ? { cantidad: p.promoCantidad, precio: p.promoPrecio! } : null,
});

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  const idLata = await crearProducto(
    db,
    NEGOCIO,
    { ...base, nombre: 'Cerveza lata', precioVenta: 1000, costo: 600, precioEnvase: 0 },
    30,
    AUTOR,
  );
  const idSix = await crearProducto(
    db,
    NEGOCIO,
    {
      ...base,
      nombre: 'Six pack',
      precioVenta: 5500,
      costo: 3600,
      packProductoId: idLata,
      packCantidad: 6,
    },
    99, // se ignora: el pack no tiene stock propio
    AUTOR,
  );
  lata = (await obtenerProducto(db, idLata))!;
  sixPack = (await obtenerProducto(db, idSix))!;
});

describe('packs', () => {
  it('el stock del pack sale del producto base', () => {
    expect(sixPack).toMatchObject({ packProductoId: lata.id, packCantidad: 6, stock: 5 });
  });

  it('vender packs descuenta unidades del base y anular las devuelve', async () => {
    const ventaId = await registrarVenta(db, {
      negocioId: NEGOCIO,
      items: [item(sixPack, 2), item(lata, 1)],
      descuentoGeneral: 0,
      pagos: [{ medio: 'efectivo', monto: 12000 }],
      efectivoRecibido: null,
      vuelto: null,
      autor: AUTOR,
    });
    expect((await obtenerProducto(db, lata.id))!.stock).toBe(17);
    // 17 latas alcanzan para 2 six-pack completos.
    expect((await obtenerProducto(db, sixPack.id))!.stock).toBe(2);

    await anularVenta(db, ventaId, '', AUTOR);
    expect((await obtenerProducto(db, lata.id))!.stock).toBe(30);
  });

  it('comprar packs suma unidades al base y actualiza su costo unitario', async () => {
    await registrarCompra(db, {
      negocioId: NEGOCIO,
      proveedorId: null,
      documento: '',
      items: [{ productoId: sixPack.id, nombre: 'Six pack', cantidad: 4, costoUnitario: 3900 }],
      actualizarCostos: true,
      autor: AUTOR,
    });
    expect(await obtenerProducto(db, lata.id)).toMatchObject({ stock: 54, costo: 650 });
    expect((await obtenerProducto(db, sixPack.id))!.costo).toBe(3900);
  });

  it('el stock de un pack no se ajusta directamente', async () => {
    await expect(
      ajustarStock(db, {
        negocioId: NEGOCIO,
        productoId: sixPack.id,
        nuevoStock: 10,
        tipo: 'ajuste',
        motivo: 'Corrección',
        autor: AUTOR,
      }),
    ).rejects.toThrow('producto base');
  });

  it('actualizar sin datos de fase 8 mantiene el pack; quitarlo lo deja como producto normal', async () => {
    const datos = { ...base, nombre: 'Six pack', precioVenta: 5990, costo: 3600 };
    await actualizarProducto(db, sixPack.id, datos);
    expect(await obtenerProducto(db, sixPack.id)).toMatchObject({
      precioVenta: 5990,
      packProductoId: lata.id,
    });
    await actualizarProducto(db, sixPack.id, {
      ...datos,
      packProductoId: null,
      packCantidad: null,
    });
    expect(await obtenerProducto(db, sixPack.id)).toMatchObject({ packProductoId: null, stock: 0 });
  });
});

describe('promociones por cantidad', () => {
  it('cobra los grupos completos a precio de promo y el resto normal', () => {
    const promo = { cantidad: 3, precio: 2500 };
    const linea = { precioUnitario: 1000, descuento: 0, promo };
    expect(descuentoPromo({ ...linea, cantidad: 2 })).toBe(0);
    expect(totalItem({ ...linea, cantidad: 3 })).toBe(2500);
    // 7 = 2 grupos (5.000) + 1 suelta (1.000).
    expect(totalItem({ ...linea, cantidad: 7 })).toBe(6000);
    expect(totalItem({ ...linea, cantidad: 7, descuento: 500 })).toBe(5500);
  });

  it('la venta guarda la promo como descuento de la línea', async () => {
    await actualizarProducto(db, lata.id, {
      ...base,
      nombre: 'Cerveza lata',
      precioVenta: 1000,
      costo: 600,
      promoCantidad: 3,
      promoPrecio: 2500,
    });
    lata = (await obtenerProducto(db, lata.id))!;
    expect(lata).toMatchObject({ promoCantidad: 3, promoPrecio: 2500 });

    const ventaId = await registrarVenta(db, {
      negocioId: NEGOCIO,
      items: [item(lata, 4)],
      descuentoGeneral: 0,
      pagos: [{ medio: 'efectivo', monto: 3500 }],
      efectivoRecibido: null,
      vuelto: null,
      autor: AUTOR,
    });
    const venta = (await obtenerVenta(db, ventaId))!;
    expect(venta.total).toBe(3500);
    expect(venta.items[0]).toMatchObject({ cantidad: 4, precioUnitario: 1000, descuento: 500 });
  });

  it('el carrito toma la promo del producto (no en productos por kilo)', () => {
    useCarrito.getState().vaciar();
    useCarrito.getState().agregarProducto({ ...lata, promoCantidad: 2, promoPrecio: 1800 });
    expect(useCarrito.getState().items[0].promo).toEqual({ cantidad: 2, precio: 1800 });
    useCarrito.getState().vaciar();
    useCarrito
      .getState()
      .agregarProducto({ ...lata, unidad: 'kg', promoCantidad: 2, promoPrecio: 1800 });
    expect(useCarrito.getState().items[0].promo).toBeNull();
  });
});

describe('envases retornables', () => {
  it('cobrar el envase agrega una línea aparte, sin stock ni costo', () => {
    const carrito = useCarrito.getState();
    carrito.vaciar();
    carrito.agregarProducto({ ...lata, nombre: 'Cerveza 1 L', precioEnvase: 300 }, 2);
    useCarrito.getState().alternarEnvase(lata.id);
    expect(useCarrito.getState().items[1]).toMatchObject({
      clave: `envase-${lata.id}`,
      productoId: null,
      nombre: 'Envase Cerveza 1 L',
      cantidad: 2,
      precioUnitario: 300,
    });
    // Tocar de nuevo lo quita; quitar el producto también quita su envase.
    useCarrito.getState().alternarEnvase(lata.id);
    expect(useCarrito.getState().items).toHaveLength(1);
    useCarrito.getState().alternarEnvase(lata.id);
    useCarrito.getState().quitar(lata.id);
    expect(useCarrito.getState().items).toEqual([]);
  });
});

describe('alcohol', () => {
  it('las categorías sugeridas de alcohol se crean marcadas y sus productos lo heredan', async () => {
    const cervezas = await crearCategoria(db, NEGOCIO, 'Cervezas');
    const snacks = await crearCategoria(db, NEGOCIO, 'Snacks');
    expect(cervezas.alcohol).toBe(true);
    expect(snacks.alcohol).toBe(false);
    await actualizarProducto(db, lata.id, {
      ...base,
      nombre: 'Cerveza lata',
      precioVenta: 1000,
      costo: 600,
      categoriaId: cervezas.id,
    });
    expect((await obtenerProducto(db, lata.id))!.alcohol).toBe(true);
    expect((await listarCategorias(db, NEGOCIO)).map((c) => [c.nombre, c.alcohol])).toEqual([
      ['Cervezas', true],
      ['Snacks', false],
    ]);
  });
});

describe('fiado', () => {
  it('venta fiada, pago en efectivo con caja abierta y anulación', async () => {
    const clienteId = await crearCliente(db, NEGOCIO, {
      nombre: 'Don Juan',
      telefono: '+56911112222',
      limiteCredito: 10000,
    });
    await expect(
      registrarVenta(db, {
        negocioId: NEGOCIO,
        items: [item(lata, 1)],
        descuentoGeneral: 0,
        pagos: [{ medio: 'fiado', monto: 1000 }],
        efectivoRecibido: null,
        vuelto: null,
        autor: AUTOR,
      }),
    ).rejects.toThrow('cliente');

    // Paga 2.000 en efectivo y fía 4.000.
    const ventaId = await registrarVenta(db, {
      negocioId: NEGOCIO,
      items: [item(lata, 6)],
      descuentoGeneral: 0,
      pagos: [
        { medio: 'fiado', monto: 4000 },
        { medio: 'efectivo', monto: 2000 },
      ],
      efectivoRecibido: null,
      vuelto: null,
      clienteId,
      autor: AUTOR,
    });
    let cliente = (await obtenerCliente(db, clienteId))!;
    expect(cliente.saldo).toBe(4000);
    expect(revisarLimite(cliente, 6000)).toBeNull();
    expect(revisarLimite(cliente, 6001)).toMatch('solo se le pueden fiar $6.000 más');
    const venta = (await obtenerVenta(db, ventaId))!;
    expect(venta.cliente).toBe('Don Juan');
    expect(textoComprobante('Botillería', venta)).toContain('Fiado (Don Juan): $4.000');

    // Paga 1.500 en efectivo: baja la deuda y entra a la caja.
    const cajaId = await abrirCaja(db, NEGOCIO, 10000, AUTOR);
    await registrarAbono(db, {
      negocioId: NEGOCIO,
      clienteId,
      monto: 1500,
      medio: 'efectivo',
      cajaId,
      autor: AUTOR,
    });
    cliente = (await obtenerCliente(db, clienteId))!;
    expect(cliente.saldo).toBe(2500);
    expect(await totalFiado(db, NEGOCIO)).toBe(2500);
    const caja = await obtenerCajaAbierta(db, NEGOCIO, AUTOR.dispositivoId);
    expect((await resumirCaja(db, caja!.id)).ingresos).toBe(1500);

    // Anular la venta descuenta lo fiado: queda a favor del cliente lo que ya pagó.
    await anularVenta(db, ventaId, 'error', AUTOR);
    cliente = (await obtenerCliente(db, clienteId))!;
    expect(cliente.saldo).toBe(-1500);
    expect((await listarMovimientosCliente(db, clienteId)).map((m) => [m.tipo, m.monto])).toEqual([
      ['anulacion', 4000],
      ['abono', 1500],
      ['cargo', 4000],
    ]);
  });
});
