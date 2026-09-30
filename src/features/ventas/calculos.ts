/** Cálculos de una venta. Todos los montos son pesos enteros. */

import { formatearCLP } from '@/lib/formato';

export type MedioPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'fiado';

export const MEDIOS_PAGO: { valor: MedioPago; etiqueta: string }[] = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'debito', etiqueta: 'Débito' },
  { valor: 'credito', etiqueta: 'Crédito' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'fiado', etiqueta: 'Fiado' },
];

/** Medios con que un cliente puede pagar lo que debe (todos menos fiado). */
export const MEDIOS_ABONO = MEDIOS_PAGO.filter((m) => m.valor !== 'fiado');

/** Montos en cero por cada medio, para ir sumando. */
export const porMedioVacio = (): Record<MedioPago, number> => ({
  efectivo: 0,
  debito: 0,
  credito: 0,
  transferencia: 0,
  fiado: 0,
});

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
  /** Promoción por cantidad del producto (ej. 3 x $2.000). */
  promo?: Promo | null;
  /** Precio del envase retornable (0 o ausente si no tiene). */
  precioEnvase?: number;
  /** Producto de una categoría de alcohol. */
  alcohol?: boolean;
};

export type Promo = { cantidad: number; precio: number };

export type Pago = { medio: MedioPago; monto: number };

type LineaPrecio = Pick<ItemCarrito, 'cantidad' | 'precioUnitario' | 'descuento' | 'promo'>;

/**
 * Descuento que da la promoción por cantidad: cada grupo completo (ej. 3
 * unidades) se cobra al precio de la promo y el resto a precio normal.
 */
export function descuentoPromo(item: Omit<LineaPrecio, 'descuento'>): number {
  const promo = item.promo;
  if (!promo || promo.cantidad < 2 || item.cantidad < promo.cantidad) return 0;
  const grupos = Math.floor(item.cantidad / promo.cantidad);
  const normal = Math.round(item.precioUnitario * item.cantidad);
  const conPromo =
    grupos * promo.precio +
    Math.round(item.precioUnitario * (item.cantidad - grupos * promo.cantidad));
  return Math.max(0, normal - conPromo);
}

/**
 * Total de una línea: precio × cantidad (redondeado, por los kilos), menos la
 * promoción y el descuento manual.
 */
export function totalItem(item: LineaPrecio) {
  return Math.max(
    0,
    Math.round(item.precioUnitario * item.cantidad) - descuentoPromo(item) - item.descuento,
  );
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
