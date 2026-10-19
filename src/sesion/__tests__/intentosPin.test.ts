import {
  ESPERA_MAXIMA_MS,
  ESPERA_MS,
  exportarIntentos,
  importarIntentos,
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

it('pasada la espera se cuentan de nuevo 5 fallos y la espera se duplica', () => {
  for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo('ana', T0);
  const despues = T0 + ESPERA_MS + 1;
  for (let i = 1; i < MAX_INTENTOS; i++) expect(registrarFallo('ana', despues)).toBe(0);
  expect(registrarFallo('ana', despues)).toBe(ESPERA_MS * 2);
});

it('la espera no pasa del máximo', () => {
  let ahora = T0;
  for (let bloqueo = 0; bloqueo < 20; bloqueo++) {
    for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo('ana', ahora);
    expect(esperaRestante('ana', ahora)).toBeLessThanOrEqual(ESPERA_MAXIMA_MS);
    ahora += ESPERA_MAXIMA_MS + 1;
  }
  for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo('ana', ahora);
  expect(esperaRestante('ana', ahora)).toBe(ESPERA_MAXIMA_MS);
});

it('el bloqueo sobrevive a reiniciar la app (exportar e importar)', () => {
  for (let i = 0; i < MAX_INTENTOS; i++) registrarFallo('ana', T0);
  const guardado = exportarIntentos();
  reiniciarIntentos();
  expect(esperaRestante('ana', T0)).toBe(0);
  importarIntentos(guardado);
  expect(esperaRestante('ana', T0)).toBe(ESPERA_MS);
});

it('importar un texto ilegible no falla', () => {
  expect(() => importarIntentos('{no es json')).not.toThrow();
  expect(() => importarIntentos(null)).not.toThrow();
  expect(esperaRestante('ana', T0)).toBe(0);
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
