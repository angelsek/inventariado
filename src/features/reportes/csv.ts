import type { Reporte } from '@/db/reportes';
import { armarCsv } from '@/features/exportar/exportar';
import { MEDIOS_PAGO } from '@/features/ventas/calculos';

import { etiquetaDia } from './periodo';

/** El reporte completo en un CSV (una sección por bloque), para abrir en Excel. */
export function csvReporte(reporte: Reporte, titulo: string): string {
  const filas: unknown[][] = [
    ['Resumen', titulo, null, null, null],
    ['Resumen', 'Ventas', reporte.cantidad, reporte.total, reporte.ganancia],
    ['Resumen', 'Ticket promedio', null, reporte.ticketPromedio, null],
    ['Resumen', 'Descuentos', null, reporte.descuentos, null],
    ['Resumen', 'Anuladas', reporte.anuladas.cantidad, reporte.anuladas.monto, null],
    ['Resumen', 'Período anterior', reporte.anterior.cantidad, reporte.anterior.total, null],
    ...MEDIOS_PAGO.map((m) => ['Medio de pago', m.etiqueta, null, reporte.porMedio[m.valor], null]),
    ...reporte.porDia.map((d) => ['Por día', etiquetaDia(d.dia), d.cantidad, d.monto, null]),
    ...reporte.porHora.map((h) => ['Por hora', `${h.hora}:00`, h.cantidad, h.monto, null]),
    ...reporte.porCajero.map((c) => ['Por cajero', c.nombre, c.cantidad, c.monto, null]),
    ...reporte.porCategoria.map((c) => ['Por categoría', c.nombre, c.cantidad, c.monto, null]),
    ...reporte.productos.map((p) => ['Producto', p.nombre, p.cantidad, p.monto, p.ganancia]),
    ...reporte.sinVentas.map((p) => ['Sin ventas', p.nombre, p.stock, p.valorCosto, null]),
  ];
  return armarCsv(['seccion', 'concepto', 'cantidad', 'monto', 'ganancia'], filas);
}
