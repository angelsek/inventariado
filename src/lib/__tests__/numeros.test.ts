import { formatearCantidad, parsearCantidad, parsearMonto } from '../numeros';

it.each([
  ['1990', 1990],
  ['$1.990', 1990],
  [' 12.500 ', 12500],
  ['0', 0],
  ['1990,6', 1991],
  ['', null],
  ['abc', null],
  ['-5', null],
])('parsearMonto(%p) = %p', (texto, esperado) => {
  expect(parsearMonto(texto)).toBe(esperado);
});

it.each([
  ['1,5', 1.5],
  ['2.25', 2.25],
  ['10', 10],
  ['-3', -3],
  ['', null],
  ['1,2,3', null],
])('parsearCantidad(%p) = %p', (texto, esperado) => {
  expect(parsearCantidad(texto)).toBe(esperado);
});

it('formatea cantidades con coma decimal', () => {
  expect(formatearCantidad(1.5)).toBe('1,5');
  expect(formatearCantidad(3)).toBe('3');
  expect(formatearCantidad(0.1 + 0.2)).toBe('0,3');
});
