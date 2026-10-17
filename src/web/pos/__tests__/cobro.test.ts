import { leerMultiplicador, quitarLectura } from '../cobro';

it('lee el multiplicador escrito antes de escanear', () => {
  expect(leerMultiplicador('3*7801610001196')).toBe(3);
  expect(leerMultiplicador(' 12 * ')).toBe(12);
  expect(leerMultiplicador('1,5*')).toBe(1.5);
  expect(leerMultiplicador('7801610001196')).toBe(1);
  expect(leerMultiplicador('0*')).toBe(1);
  expect(leerMultiplicador('')).toBe(1);
});

it('quita del monto recibido lo que escribió la pistola', () => {
  expect(quitarLectura('50007801610001196', '7801610001196')).toBe('5000');
  expect(quitarLectura('7801610001196', '7801610001196')).toBe('');
  expect(quitarLectura('5000', '7801610001196')).toBe('5000');
});
