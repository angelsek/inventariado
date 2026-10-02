import type { Cliente, MovimientoCliente } from '@/db/clientes';
import { etiquetaMedio } from '@/features/ventas/calculos';
import { formatearCLP, formatearFecha } from '@/lib/formato';

const ETIQUETAS = { cargo: 'Compra', abono: 'Pago', anulacion: 'Compra anulada' } as const;

/** Texto para mandarle al cliente por WhatsApp: saldo y últimos movimientos. */
export function textoEstadoCuenta(
  negocio: string,
  cliente: Cliente,
  movimientos: MovimientoCliente[],
): string {
  const lineas = [
    `*${negocio}*`,
    `Hola ${cliente.nombre}, este es el detalle de tu cuenta:`,
    '',
    ...movimientos.slice(0, 15).map((m) => {
      const signo = m.tipo === 'cargo' ? '' : '-';
      const medio = m.medio ? ` (${etiquetaMedio(m.medio)})` : '';
      return `${formatearFecha(new Date(m.creadoEn))}  ${ETIQUETAS[m.tipo]}${medio}: ${signo}${formatearCLP(m.monto)}`;
    }),
    '',
    cliente.saldo > 0
      ? `*Total a pagar: ${formatearCLP(cliente.saldo)}*`
      : '*No tienes deuda pendiente.* ¡Gracias!',
  ];
  return lineas.join('\n');
}

export const etiquetaMovimientoCliente = (tipo: MovimientoCliente['tipo']) => ETIQUETAS[tipo];
