import { leerCsv } from '../csv';

it('lee CSV con punto y coma (Excel en Chile) y BOM', () => {
  const texto = '﻿nombre;precio\r\nCerveza;1.290\r\nPan;"2.000"\r\n';
  expect(leerCsv(texto)).toEqual([
    ['nombre', 'precio'],
    ['Cerveza', '1.290'],
    ['Pan', '2.000'],
  ]);
});

it('lee CSV con comas y campos entre comillas', () => {
  const texto = 'nombre,precio\n"Vino ""Reserva"", 750cc",4990\nAgua,800';
  expect(leerCsv(texto)).toEqual([
    ['nombre', 'precio'],
    ['Vino "Reserva", 750cc', '4990'],
    ['Agua', '800'],
  ]);
});

it('ignora líneas vacías', () => {
  expect(leerCsv('a;b\n\n1;2\n;\n')).toEqual([
    ['a', 'b'],
    ['1', '2'],
  ]);
});
