import { calcularPeriodo, etiquetaPeriodo, moverPeriodo } from '../periodo';

// Miércoles 15 de octubre de 2026, 10:30 (hora local).
const REFERENCIA = new Date(2026, 9, 15, 10, 30);

it('día, semana (de lunes a domingo) y mes', () => {
  expect(calcularPeriodo('dia', REFERENCIA)).toMatchObject({
    inicio: new Date(2026, 9, 15),
    fin: new Date(2026, 9, 16),
  });
  expect(calcularPeriodo('semana', REFERENCIA)).toMatchObject({
    inicio: new Date(2026, 9, 12),
    fin: new Date(2026, 9, 19),
  });
  // Un domingo pertenece a la semana que empezó el lunes anterior.
  expect(calcularPeriodo('semana', new Date(2026, 9, 18)).inicio).toEqual(new Date(2026, 9, 12));
  expect(calcularPeriodo('mes', REFERENCIA)).toMatchObject({
    inicio: new Date(2026, 9, 1),
    fin: new Date(2026, 10, 1),
  });
});

it('se mueve al período anterior y siguiente, cruzando meses y años', () => {
  const enero = calcularPeriodo('mes', new Date(2027, 0, 20));
  expect(moverPeriodo(enero, -1).inicio).toEqual(new Date(2026, 11, 1));
  const dia = calcularPeriodo('dia', new Date(2026, 9, 31));
  expect(moverPeriodo(dia, 1).inicio).toEqual(new Date(2026, 10, 1));
  const semana = calcularPeriodo('semana', REFERENCIA);
  expect(moverPeriodo(semana, -1).inicio).toEqual(new Date(2026, 9, 5));
});

it('etiquetas legibles', () => {
  const hoy = calcularPeriodo('dia', REFERENCIA);
  expect(etiquetaPeriodo(hoy, REFERENCIA)).toBe('Hoy');
  expect(etiquetaPeriodo(moverPeriodo(hoy, -1), REFERENCIA)).toBe('Ayer');
  expect(etiquetaPeriodo(moverPeriodo(hoy, -2), REFERENCIA)).toBe('13 oct 2026');
  const semana = calcularPeriodo('semana', REFERENCIA);
  expect(etiquetaPeriodo(semana, REFERENCIA)).toBe('Esta semana');
  expect(etiquetaPeriodo(moverPeriodo(semana, -1), REFERENCIA)).toBe('5 oct – 11 oct');
  expect(etiquetaPeriodo(calcularPeriodo('mes', REFERENCIA), REFERENCIA)).toBe('Octubre 2026');
});
