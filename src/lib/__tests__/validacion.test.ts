import { esCorreoValido, esRutValido, formatearRut } from '../validacion';

describe('esRutValido', () => {
  it.each(['11.111.111-1', '12.345.678-5', '123456785', '7.654.321-6', '10.000.013-k'])(
    'acepta %s',
    (rut) => expect(esRutValido(rut)).toBe(true),
  );

  it.each(['12.345.678-9', '1-9', 'abc', '', '11.111.111-K'])('rechaza %p', (rut) =>
    expect(esRutValido(rut)).toBe(false),
  );
});

it('formatea el RUT con puntos y guion', () => {
  expect(formatearRut('123456785')).toBe('12.345.678-5');
  expect(formatearRut('7654321-6')).toBe('7.654.321-6');
});

it('valida correos', () => {
  expect(esCorreoValido(' ana@ejemplo.cl ')).toBe(true);
  expect(esCorreoValido('ana@ejemplo')).toBe(false);
});
