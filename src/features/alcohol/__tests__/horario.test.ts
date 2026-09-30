import { dentroDelHorario, normalizarHora } from '../horario';

const a = (h: number, m = 0) => new Date(2026, 9, 15, h, m);

it('normaliza horas escritas de distintas formas', () => {
  expect(normalizarHora('9:5')).toBe('09:05');
  expect(normalizarHora('0905')).toBe('09:05');
  expect(normalizarHora('22')).toBe('22:00');
  expect(normalizarHora('24:00')).toBeNull();
  expect(normalizarHora('10:60')).toBeNull();
  expect(normalizarHora('diez')).toBeNull();
});

it('horario dentro del mismo día', () => {
  expect(dentroDelHorario(a(10), '10:00', '23:00')).toBe(true);
  expect(dentroDelHorario(a(9, 59), '10:00', '23:00')).toBe(false);
  expect(dentroDelHorario(a(23), '10:00', '23:00')).toBe(false);
});

it('horario que pasa la medianoche', () => {
  expect(dentroDelHorario(a(1, 30), '10:00', '02:00')).toBe(true);
  expect(dentroDelHorario(a(2, 0), '10:00', '02:00')).toBe(false);
  expect(dentroDelHorario(a(8), '10:00', '02:00')).toBe(false);
  expect(dentroDelHorario(a(20), '10:00', '02:00')).toBe(true);
});

it('sin horario configurado siempre se puede', () => {
  expect(dentroDelHorario(a(4), null, null)).toBe(true);
});
