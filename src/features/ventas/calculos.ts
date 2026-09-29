/** Cálculos de una venta. Todos los montos son pesos enteros. */

import { formatearCLP } from '@/lib/formato';

export type MedioPago = 'efectivo' | 'debito' | 'credito' | 'transferencia';

export const MEDIOS_PAGO: { valor: MedioPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'debito', etiqueta: 'Débito' },
  { valor: 'credito', etiqueta: 'Crédito' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
];

export const etiquetaMedio = (medio: MedioPago) =>
  MEDIOS_PAGO.find((m) => m.valor === medio)?.etiqueta ?? medio;

export type ItemCarrito = {
  /** Identifica la línea en el carrito (un mismo producto puede tener una sola línea). */
  clave: string;
  /** null para un "monto libre" que no está en el catálogo. */
  productoId: string | null;
  nombre: string;
  unidad: 'unidad' | 'pack' | 'kg';
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  /** Descuento en pesos para toda la línea. */
  descuento: number;
  /** Stock al agregarlo, para avisar si no alcanza. null si no aplica. */
  stock: number | null;
};

export type Pago = { medio: MedioPago; monto: number };

/** Total de una línea: precio × cantidad (redondeado, por los kilos) menos su descuento. */
export function totalItem(item: Pick<ItemCarrito, 'cantidad' | 'precioUnitario' | 'descuento'>) {
  return Math.max(0, Math.round(item.precioUnitario * item.cantidad) - item.descuento);
}

export function calcularTotales(items: ItemCarrito[], descuentoGeneral: number) {
  const subtotal = items.reduce((suma, item) => suma + totalItem(item), 0);
  const descuento = Math.min(Math.max(0, Math.round(descuentoGeneral)), subtotal);
  return { subtotal, descuento, total: subtotal - descuento };
}

/**
 * Revisa los pagos contra el total. En efectivo se puede recibir más (vuelto);
 * el resto de los medios debe calzar exacto. El vuelto sale del efectivo.
 */
export function revisarPagos(
  total: number,
  pagos: Pago[],
  efectivoRecibido: number | null,
):
  | { ok: true; pagos: Pago[]; efectivoRecibido: number | null; vuelto: number | null }
  | { ok: false; error: string } {
  const validos = pagos.filter((p) => p.monto > 0);
  const efectivo = validos.filter((p) => p.medio === 'efectivo').reduce((s, p) => s + p.monto, 0);
  const otros = validos.filter((p) => p.medio !== 'efectivo').reduce((s, p) => s + p.monto, 0);

  if (otros > total)
    return { ok: false, error: 'Los pagos con tarjeta o transferencia superan el total.' };

  const efectivoNecesario = total - otros;
  if (efectivo === 0 && efectivoNecesario === 0) {
    return { ok: true, pagos: validos, efectivoRecibido: null, vuelto: null };
  }
  if (efectivo === 0) {
    return { ok: false, error: `Faltan ${formatearCLP(efectivoNecesario)} por pagar.` };
  }

  const recibido = efectivoRecibido ?? efectivo;
  if (recibido < efectivoNecesario) {
    return { ok: false, error: `Faltan ${formatearCLP(efectivoNecesario - recibido)} por pagar.` };
  }

  // Se registra como pago en efectivo solo lo que cubre la venta; el resto es vuelto.
  const pagosFinales = [
    ...validos.filter((p) => p.medio !== 'efectivo'),
    ...(efectivoNecesario > 0 ? [{ medio: 'efectivo' as const, monto: efectivoNecesario }] : []),
  ];
  return {
    ok: true,
    pagos: pagosFinales,
    efectivoRecibido: recibido,
    vuelto: recibido - efectivoNecesario,
  };
}

/** Billetes para cobrar rápido en efectivo: el monto exacto y los billetes que lo cubren. */
export function montosRapidos(total: number): number[] {
  const billetes = [1000, 5000, 10000, 20000];
  const sugeridos = new Set<number>([total]);
  for (const billete of billetes) {
    const redondeado = Math.ceil(total / billete) * billete;
    if (redondeado > total) sugeridos.add(redondeado);
  }
  return [...sugeridos].sort((a, b) => a - b).slice(0, 5);
}
