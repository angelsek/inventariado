import type { Reporte } from '@/db/reportes';
import { porMedioVacio } from '@/features/ventas/calculos';

import { csvReporte } from '../csv';

const REPORTE: Reporte = {
  total: 25000,
  cantidad: 3,
  ticketPromedio: 8333,
  ganancia: -1500, // un período puede cerrar en pérdida
  margen: -0.06,
  descuentos: 500,
  anuladas: { cantidad: 1, monto: 2000 },
  itemsSinCosto: 0,
  anterior: { total: 30000, cantidad: 4 },
  porMedio: porMedioVacio(),
  porDia: [],
  porHora: [],
  porCajero: [{ nombre: '=cmd|" /c calc"!A1', monto: 25000, cantidad: 3 }],
  porCategoria: [{ nombre: '-Bebidas', monto: 25000, cantidad: 3 }],
  productos: [
    {
      productoId: 'p1',
      nombre: '@oferta del día',
      unidad: 'unidad',
      cantidad: 3,
      monto: 25000,
      ganancia: -1500,
    },
  ],
  sinVentas: [{ id: 'p2', nombre: '+Pack 6', stock: 4, valorCosto: 4000 }],
};

it('el CSV del reporte deja como texto los nombres que empiezan como una fórmula', () => {
  const lineas = csvReporte(REPORTE, '=octubre').trim().split('\r\n');

  expect(lineas).toContain("Resumen;'=octubre;;;");
  expect(lineas).toContain('Por cajero;"\'=cmd|"" /c calc""!A1";3;25000;');
  expect(lineas).toContain("Por categoría;'-Bebidas;3;25000;");
  expect(lineas).toContain("Producto;'@oferta del día;3;25000;-1500");
  expect(lineas).toContain("Sin ventas;'+Pack 6;4;4000;");
});

it('las ganancias negativas del reporte siguen siendo números', () => {
  const resumen = csvReporte(REPORTE, 'Octubre')
    .trim()
    .split('\r\n')
    .find((l) => l.startsWith('Resumen;Ventas'));

  expect(resumen).toBe('Resumen;Ventas;3;25000;-1500');
});
