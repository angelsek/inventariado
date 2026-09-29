import {
  abrirCaja,
  cerrarCaja,
  listarCajasCerradas,
  obtenerCajaAbierta,
  registrarMovimientoCaja,
  resumirCaja,
} from '@/db/cajas';
import { listarCompras, registrarCompra } from '@/db/compras';
import { migrarBaseDeDatos } from '@/db/migraciones';
import {
  ajustarStock,
  crearProducto,
  listarMovimientos,
  listarParaReponer,
  obtenerProducto,
} from '@/db/productos';
import { guardarProveedor, listarProveedores } from '@/db/proveedores';
import type { BaseLocal } from '@/db/tipos';
import { anularVenta, registrarVenta } from '@/db/ventas';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

import { aplicarConteo, useConteo } from '../conteo';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';
const AUTOR = { perfilId: 'perfil-1', dispositivoId: 'disp-1' };
const base = { codigoBarras: null, categoriaId: null, unidad: 'unidad' as const };

let db: BaseLocal;
let cervezaId: string;
let aguaId: string;

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  await db.runAsync(
    `INSERT INTO perfiles (id, negocio_id, nombre, rol, pin_hash, creado_en, actualizado_en)
     VALUES ('perfil-1', ?, 'Ana', 'dueno', 'x', '2026-01-01', '2026-01-01')`,
    NEGOCIO,
  );
  cervezaId = await crearProducto(
    db,
    NEGOCIO,
    { ...base, nombre: 'Cerveza', precioVenta: 1290, costo: 800, stockMinimo: 12 },
    10,
    AUTOR,
  );
  aguaId = await crearProducto(
    db,
    NEGOCIO,
    { ...base, nombre: 'Agua', precioVenta: 800, costo: 400, stockMinimo: 0 },
    30,
    AUTOR,
  );
});

it('un ingreso de mercadería suma stock y actualiza el costo', async () => {
  const proveedor = await guardarProveedor(db, NEGOCIO, {
    nombre: 'Distribuidora Sur',
    rut: '',
    telefono: '',
  });
  expect((await listarProveedores(db, NEGOCIO)).map((p) => p.nombre)).toEqual([
    'Distribuidora Sur',
  ]);

  await registrarCompra(db, {
    negocioId: NEGOCIO,
    proveedorId: proveedor.id,
    documento: 'Factura 55',
    items: [
      { productoId: cervezaId, nombre: 'Cerveza', cantidad: 24, costoUnitario: 850 },
      { productoId: aguaId, nombre: 'Agua', cantidad: 6, costoUnitario: 400 },
    ],
    actualizarCostos: true,
    autor: AUTOR,
  });

  expect(await obtenerProducto(db, cervezaId)).toMatchObject({ stock: 34, costo: 850 });
  expect(await obtenerProducto(db, aguaId)).toMatchObject({ stock: 36, costo: 400 });

  const [compra] = await listarCompras(db, NEGOCIO);
  expect(compra).toMatchObject({
    proveedor: 'Distribuidora Sur',
    documento: 'Factura 55',
    total: 22800,
  });
  expect(compra.items).toHaveLength(2);
});

it('sin actualizar costos, el costo del producto no cambia', async () => {
  await registrarCompra(db, {
    negocioId: NEGOCIO,
    proveedorId: null,
    documento: '',
    items: [{ productoId: cervezaId, nombre: 'Cerveza', cantidad: 1, costoUnitario: 999 }],
    actualizarCostos: false,
    autor: AUTOR,
  });
  expect((await obtenerProducto(db, cervezaId))?.costo).toBe(800);
});

it('ajuste de stock registra la diferencia con motivo y queda en el historial', async () => {
  const diferencia = await ajustarStock(db, {
    negocioId: NEGOCIO,
    productoId: cervezaId,
    nuevoStock: 7,
    tipo: 'ajuste',
    motivo: 'Rotura',
    autor: AUTOR,
  });
  expect(diferencia).toBe(-3);
  expect((await obtenerProducto(db, cervezaId))?.stock).toBe(7);

  const [ultimo, primero] = await listarMovimientos(db, cervezaId);
  expect(ultimo).toMatchObject({ tipo: 'ajuste', cantidad: -3, motivo: 'Rotura', perfil: 'Ana' });
  expect(primero).toMatchObject({ tipo: 'inicial', cantidad: 10 });
});

it('lista para reponer los productos bajo el mínimo o sin stock', async () => {
  expect((await listarParaReponer(db, NEGOCIO)).map((p) => p.nombre)).toEqual(['Cerveza']);
  await ajustarStock(db, {
    negocioId: NEGOCIO,
    productoId: aguaId,
    nuevoStock: 0,
    tipo: 'ajuste',
    motivo: 'Corrección',
    autor: AUTOR,
  });
  expect((await listarParaReponer(db, NEGOCIO)).map((p) => p.nombre).sort()).toEqual([
    'Agua',
    'Cerveza',
  ]);
});

it('el conteo deja el stock igual a lo contado', async () => {
  const conteo = useConteo.getState();
  conteo.vaciar();
  conteo.sumar({ productoId: cervezaId, nombre: 'Cerveza', unidad: 'unidad', stockSistema: 10 }, 1);
  conteo.sumar({ productoId: cervezaId, nombre: 'Cerveza', unidad: 'unidad', stockSistema: 10 }, 1);
  useConteo.getState().fijar(cervezaId, 8);
  useConteo
    .getState()
    .sumar({ productoId: aguaId, nombre: 'Agua', unidad: 'unidad', stockSistema: 30 }, 30);

  const resultado = await aplicarConteo(db, NEGOCIO, useConteo.getState().lineas, AUTOR);
  expect(resultado).toEqual({ ajustados: 1, sinCambios: 1 });
  expect((await obtenerProducto(db, cervezaId))?.stock).toBe(8);
  expect((await listarMovimientos(db, cervezaId))[0]).toMatchObject({
    tipo: 'conteo',
    cantidad: -2,
    motivo: 'Toma de inventario',
  });
});

describe('caja', () => {
  it('abre, suma ventas en efectivo, retiros e ingresos, y cierra con diferencia', async () => {
    expect(await obtenerCajaAbierta(db, NEGOCIO, AUTOR.dispositivoId)).toBeNull();
    const cajaId = await abrirCaja(db, NEGOCIO, 20000, AUTOR);
    // Abrir de nuevo devuelve la misma caja.
    expect(await abrirCaja(db, NEGOCIO, 5000, AUTOR)).toBe(cajaId);

    const item = {
      clave: cervezaId,
      productoId: cervezaId,
      nombre: 'Cerveza',
      unidad: 'unidad' as const,
      cantidad: 2,
      precioUnitario: 1290,
      costoUnitario: 800,
      descuento: 0,
      stock: 10,
    };
    await registrarVenta(db, {
      negocioId: NEGOCIO,
      items: [item],
      descuentoGeneral: 0,
      pagos: [{ medio: 'efectivo', monto: 2580 }],
      efectivoRecibido: 3000,
      vuelto: 420,
      cajaId,
      autor: AUTOR,
    });
    await registrarVenta(db, {
      negocioId: NEGOCIO,
      items: [item],
      descuentoGeneral: 0,
      pagos: [{ medio: 'debito', monto: 2580 }],
      efectivoRecibido: null,
      vuelto: null,
      cajaId,
      autor: AUTOR,
    });
    const anulada = await registrarVenta(db, {
      negocioId: NEGOCIO,
      items: [item],
      descuentoGeneral: 0,
      pagos: [{ medio: 'efectivo', monto: 2580 }],
      efectivoRecibido: 2580,
      vuelto: 0,
      cajaId,
      autor: AUTOR,
    });
    await anularVenta(db, anulada, '', AUTOR);

    await registrarMovimientoCaja(db, {
      negocioId: NEGOCIO,
      cajaId,
      tipo: 'retiro',
      monto: 5000,
      motivo: 'Pago hielo',
      autor: AUTOR,
    });
    await registrarMovimientoCaja(db, {
      negocioId: NEGOCIO,
      cajaId,
      tipo: 'ingreso',
      monto: 1000,
      motivo: 'Sencillo',
      autor: AUTOR,
    });

    expect(await resumirCaja(db, cajaId)).toEqual({
      montoInicial: 20000,
      cantidadVentas: 2,
      totalVentas: 5160,
      porMedio: { efectivo: 2580, debito: 2580, credito: 0, transferencia: 0 },
      ingresos: 1000,
      retiros: 5000,
      efectivoEsperado: 18580,
    });

    expect(await cerrarCaja(db, cajaId, 18500, 'Faltó sencillo', AUTOR)).toBe(-80);
    expect(await obtenerCajaAbierta(db, NEGOCIO, AUTOR.dispositivoId)).toBeNull();
    const [cerrada] = await listarCajasCerradas(db, NEGOCIO);
    expect(cerrada).toMatchObject({
      id: cajaId,
      efectivoEsperado: 18580,
      montoContado: 18500,
      abiertaPor: 'Ana',
      cerradaPor: 'Ana',
      notas: 'Faltó sencillo',
    });
  });

  it('no acepta movimientos de caja por cero', async () => {
    const cajaId = await abrirCaja(db, NEGOCIO, 0, AUTOR);
    await expect(
      registrarMovimientoCaja(db, {
        negocioId: NEGOCIO,
        cajaId,
        tipo: 'retiro',
        monto: 0,
        motivo: '',
        autor: AUTOR,
      }),
    ).rejects.toThrow('mayor que cero');
  });
});
