import { formatearCLP, formatearFecha, formatearFechaHora } from '../formato';

describe('formatearCLP', () => {
  it.each([
    [0, '$0'],
    [990, '$990'],
    [1000, '$1.000'],
    [1234567, '$1.234.567'],
    [-2500, '-$2.500'],
    [1499.6, '$1.500'],
  ])('%p -> %p', (monto, esperado) => {
    expect(formatearCLP(monto)).toBe(esperado);
  });
});

describe('formatearFecha', () => {
  it('usa el formato dd-mm-aaaa', () => {
    expect(formatearFecha(new Date(2026, 8, 5))).toBe('05-09-2026');
  });

  it('agrega la hora con dos dígitos', () => {
    expect(formatearFechaHora(new Date(2026, 8, 5, 7, 3))).toBe('05-09-2026 07:03');
  });
});
