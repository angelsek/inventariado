import {
  calcularTotales,
  type ItemCarrito,
  montosRapidos,
  revisarPagos,
  totalItem,
} from '../calculos';

const item = (cambios: Partial<ItemCarrito>): ItemCarrito => ({
  clave: 'x',
  productoId: 'p',
  nombre: 'Producto',
  unidad: 'unidad',
  cantidad: 1,
  precioUnitario: 1000,
  costoUnitario: 0,
  descuento: 0,
  stock: null,
  ...cambios,
});

describe('totales', () => {
  it('multiplica, redondea kilos y aplica descuentos', () => {
    expect(totalItem(item({ cantidad: 3, precioUnitario: 1290 }))).toBe(3870);
    expect(totalItem(item({ cantidad: 0.333, precioUnitario: 9990 }))).toBe(3327);
    expect(totalItem(item({ cantidad: 2, precioUnitario: 1000, descuento: 300 }))).toBe(1700);
    expect(totalItem(item({ precioUnitario: 100, descuento: 500 }))).toBe(0);
  });

  it('el descuento general no puede superar el subtotal', () => {
    const items = [item({ cantidad: 2, precioUnitario: 1290 }), item({ precioUnitario: 1000 })];
    expect(calcularTotales(items, 80)).toEqual({ subtotal: 3580, descuento: 80, total: 3500 });
    expect(calcularTotales(items, 99999)).toEqual({ subtotal: 3580, descuento: 3580, total: 0 });
  });
});

describe('revisarPagos', () => {
  it('efectivo con vuelto: registra como pago solo lo que cubre la venta', () => {
    expect(revisarPagos(3500, [{ medio: 'efectivo', monto: 3500 }], 5000)).toEqual({
      ok: true,
      pagos: [{ medio: 'efectivo', monto: 3500 }],
      efectivoRecibido: 5000,
      vuelto: 1500,
    });
  });

  it('efectivo insuficiente', () => {
    expect(revisarPagos(3500, [{ medio: 'efectivo', monto: 3500 }], 2000)).toEqual({
      ok: false,
      error: 'Faltan $1.500 por pagar.',
    });
  });

  it('tarjeta exacta, sin vuelto', () => {
    expect(revisarPagos(3500, [{ medio: 'debito', monto: 3500 }], null)).toEqual({
      ok: true,
      pagos: [{ medio: 'debito', monto: 3500 }],
      efectivoRecibido: null,
      vuelto: null,
    });
  });

  it('pago mixto: débito y el resto en efectivo con vuelto', () => {
    const r = revisarPagos(
      3500,
      [
        { medio: 'debito', monto: 2000 },
        { medio: 'efectivo', monto: 1500 },
      ],
      2000,
    );
    expect(r).toEqual({
      ok: true,
      pagos: [
        { medio: 'debito', monto: 2000 },
        { medio: 'efectivo', monto: 1500 },
      ],
      efectivoRecibido: 2000,
      vuelto: 500,
    });
  });

  it('rechaza tarjeta por más del total o pagos que no alcanzan', () => {
    expect(revisarPagos(1000, [{ medio: 'credito', monto: 1500 }], null).ok).toBe(false);
    expect(revisarPagos(1000, [{ medio: 'transferencia', monto: 600 }], null)).toEqual({
      ok: false,
      error: 'Faltan $400 por pagar.',
    });
  });
});

it('montosRapidos sugiere el exacto y billetes que lo cubren', () => {
  expect(montosRapidos(3500)).toEqual([3500, 4000, 5000, 10000, 20000]);
  expect(montosRapidos(5000)).toEqual([5000, 10000, 20000]);
});
