import { crearMemoriaRecibido, leerMultiplicador } from '../cobro';

it('lee el multiplicador escrito antes de escanear', () => {
  expect(leerMultiplicador('3*7801610001196')).toBe(3);
  expect(leerMultiplicador(' 12 * ')).toBe(12);
  expect(leerMultiplicador('1,5*')).toBe(1.5);
  expect(leerMultiplicador('7801610001196')).toBe(1);
  expect(leerMultiplicador('0*')).toBe(1);
  expect(leerMultiplicador('')).toBe(1);
});

it('recuerda el monto que había antes de que la pistola escribiera en el campo', () => {
  const memoria = crearMemoriaRecibido(40);
  // La persona escribe 5000 (teclas separadas por más de 40 ms).
  let valor = '';
  let ms = 0;
  for (const d of '5000') {
    memoria.cambio(valor, (ms += 200));
    valor += d;
  }
  // Una pausa y luego la pistola escribe un código entero muy rápido.
  ms += 300;
  for (const d of '7801610001196') {
    memoria.cambio(valor, (ms += 5));
    valor = (valor + d).slice(0, 9);
  }
  expect(memoria.antesDeLaRafaga()).toBe('5000');
});
