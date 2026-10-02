import type { Caja, ResumenCaja } from '@/db/cajas';
import { formatearCLP, formatearFechaHora } from '@/lib/formato';

import { MEDIOS_PAGO } from './calculos';

/** Texto del cierre de caja para compartir con el dueño. */
export function textoCierre(negocio: string, caja: Caja, resumen: ResumenCaja): string {
  const diferencia = (caja.montoContado ?? 0) - (caja.efectivoEsperado ?? resumen.efectivoEsperado);
  const lineas = [
    `Cierre de caja · ${negocio}`,
    `Abierta: ${formatearFechaHora(new Date(caja.abiertaEn))}${caja.abiertaPor ? ` (${caja.abiertaPor})` : ''}`,
    caja.cerradaEn
      ? `Cerrada: ${formatearFechaHora(new Date(caja.cerradaEn))}${caja.cerradaPor ? ` (${caja.cerradaPor})` : ''}`
      : '',
    '--------------------------------',
    `Ventas: ${resumen.cantidadVentas} por ${formatearCLP(resumen.totalVentas)}`,
    ...MEDIOS_PAGO.filter((m) => resumen.porMedio[m.valor] > 0).map(
      (m) => `  ${m.etiqueta}: ${formatearCLP(resumen.porMedio[m.valor])}`,
    ),
    '--------------------------------',
    `Monto inicial: ${formatearCLP(resumen.montoInicial)}`,
    `+ Ventas en efectivo: ${formatearCLP(resumen.porMedio.efectivo)}`,
    `+ Ingresos: ${formatearCLP(resumen.ingresos)}`,
    `- Retiros: ${formatearCLP(resumen.retiros)}`,
    `= Efectivo esperado: ${formatearCLP(caja.efectivoEsperado ?? resumen.efectivoEsperado)}`,
    `Efectivo contado: ${formatearCLP(caja.montoContado ?? 0)}`,
    `Diferencia: ${diferencia > 0 ? '+' : ''}${formatearCLP(diferencia)}${diferencia === 0 ? ' (cuadra)' : diferencia > 0 ? ' (sobra)' : ' (falta)'}`,
  ];
  if (caja.notas) lineas.push(`Notas: ${caja.notas}`);
  return lineas.filter(Boolean).join('\n');
}
