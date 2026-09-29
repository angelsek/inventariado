import type { DetalleVenta } from '@/db/ventas';
import { formatearCLP, formatearFechaHora } from '@/lib/formato';
import { formatearCantidad } from '@/lib/numeros';

import { etiquetaMedio } from './calculos';

/** Código corto para identificar la venta al hablar con el cliente. */
export const codigoVenta = (id: string) => id.replace(/-/g, '').slice(0, 6).toUpperCase();

/** Texto del comprobante interno, para compartir por WhatsApp u otra app. */
export function textoComprobante(negocio: string, venta: DetalleVenta): string {
  const lineas = [
    negocio,
    `Comprobante N° ${codigoVenta(venta.id)}`,
    formatearFechaHora(new Date(venta.creadoEn)) +
      (venta.vendedor ? ` · Atendió: ${venta.vendedor}` : ''),
    '--------------------------------',
  ];
  for (const item of venta.items) {
    lineas.push(
      `${formatearCantidad(item.cantidad)} x ${item.nombre}  ${formatearCLP(item.total)}`,
    );
    if (item.descuento > 0) lineas.push(`   (descuento ${formatearCLP(item.descuento)})`);
  }
  lineas.push('--------------------------------');
  if (venta.descuento > 0) {
    lineas.push(`Subtotal: ${formatearCLP(venta.subtotal)}`);
    lineas.push(`Descuento: -${formatearCLP(venta.descuento)}`);
  }
  lineas.push(`TOTAL: ${formatearCLP(venta.total)}`);
  for (const pago of venta.pagos) {
    lineas.push(`${etiquetaMedio(pago.medio)}: ${formatearCLP(pago.monto)}`);
  }
  if (venta.efectivoRecibido !== null && venta.vuelto) {
    lineas.push(
      `Recibido: ${formatearCLP(venta.efectivoRecibido)} · Vuelto: ${formatearCLP(venta.vuelto)}`,
    );
  }
  if (venta.estado === 'anulada') lineas.push('*** VENTA ANULADA ***');
  lineas.push('', 'Comprobante interno, no válido como boleta.');
  return lineas.join('\n');
}
