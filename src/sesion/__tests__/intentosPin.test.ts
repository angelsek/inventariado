import {
  ESPERA_MS,
  esperaRestante,
  MAX_INTENTOS,
  registrarAcierto,
  registrarFallo,
  reiniciarIntentos,
} from '../intentosPin';

const T0 = 1_000_000;

beforeEach(reiniciarIntentos);

it('sin fallos no hay espera', () => {
  expect(esperaRestante('ana', T0)).toBe(0);
});

it('los primeros fallos no bloquean', () => {
  for (let i = 1; i < MAX_INTENTOS; i++) expect(registrarFallo('ana', T0)).toBe(0);
  expect(esperaRestante('ana', T0)).toBe(0);
});

it('el quinto fallo bloquea 30 segundos', () => {
  for (let i = 1; i < MAX_INTENTOS; i++) registrarFallo('ana', T0);
  expect(registrarFallo('ana', T0)).toBe(ESPERA_MS);
  expect(ESPERA_MS).toBe(30_000);
  expect(MAX_INTENTOS).toBe(5);
});

it('la espera baja con el tiempo y termina', () => {
  for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo('ana', T0);
  expect(esperaRestante('ana', T0 + 10_000)).toBe(20_000);
  expect(esperaRestante('ana', T0 + ESPERA_MS)).toBe(0);
  expect(esperaRestante('ana', T0 + ESPERA_MS + 1)).toBe(0);
});

it('pasada la espera se cuentan de nuevo 5 fallos', () => {
  for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo('ana', T0);
  const despues = T0 + ESPERA_MS + 1;
  for (let i = 1; i < MAX_INTENTOS; i++) expect(registrarFallo('ana', despues)).toBe(0);
  expect(registrarFallo('ana', despues)).toBe(ESPERA_MS);
});

it('un acierto borra los fallos acumulados', () => {
  for (let i = 1; i < MAX_INTENTOS; i++) registrarFallo('ana', T0);
  registrarAcierto('ana');
  for (let i = 1; i < MAX_INTENTOS; i++) expect(registrarFallo('ana', T0)).toBe(0);
});

it('cada perfil lleva su propia cuenta', () => {
  for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo('ana', T0);
  expect(esperaRestante('ana', T0)).toBe(ESPERA_MS);
  expect(esperaRestante('beto', T0)).toBe(0);
  expect(registrarFallo('beto', T0)).toBe(0);
});

it('un acierto estando bloqueado levanta el bloqueo', () => {
  for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo('ana', T0);
  registrarAcierto('ana');
  expect(esperaRestante('ana', T0)).toBe(0);
});
