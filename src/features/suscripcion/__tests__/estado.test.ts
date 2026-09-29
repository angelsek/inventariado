import { avisoSuscripcion, calcularEstado } from '../estado';

const AHORA = new Date('2026-10-15T12:00:00Z');
const dias = (n: number) => new Date(AHORA.getTime() + n * 86400000).toISOString();

it('prueba vigente, sin aviso hasta los últimos 3 días', () => {
  const e = calcularEstado(
    { planId: 'pro', pruebaHasta: dias(10), pagadoHasta: null, suspendida: false },
    AHORA,
  );
  expect(e).toMatchObject({ estado: 'prueba', diasRestantes: 10, soloLectura: false });
  expect(avisoSuscripcion(e)).toBeNull();

  const casi = calcularEstado(
    { planId: 'pro', pruebaHasta: dias(2), pagadoHasta: null, suspendida: false },
    AHORA,
  );
  expect(avisoSuscripcion(casi)).toEqual({
    texto: 'Tu prueba gratis termina en 2 días.',
    grave: false,
  });
});

it('pagada gana a la prueba', () => {
  const e = calcularEstado(
    { planId: 'basico', pruebaHasta: dias(-20), pagadoHasta: dias(25), suspendida: false },
    AHORA,
  );
  expect(e).toMatchObject({ estado: 'activa', diasRestantes: 25 });
});

it('vencida con días de gracia y luego suspendida (solo lectura)', () => {
  const vencida = calcularEstado(
    { planId: 'basico', pruebaHasta: null, pagadoHasta: dias(-3), suspendida: false },
    AHORA,
  );
  expect(vencida).toMatchObject({ estado: 'vencida', diasGracia: 4, soloLectura: false });
  expect(avisoSuscripcion(vencida)?.texto).toBe(
    'Tu suscripción venció. Te quedan 4 días antes de pasar a solo lectura.',
  );

  const fuera = calcularEstado(
    { planId: 'basico', pruebaHasta: null, pagadoHasta: dias(-8), suspendida: false },
    AHORA,
  );
  expect(fuera).toMatchObject({ estado: 'suspendida', soloLectura: true });
});

it('la suspensión manual manda aunque esté pagada', () => {
  const e = calcularEstado(
    { planId: 'pro', pruebaHasta: null, pagadoHasta: dias(30), suspendida: true },
    AHORA,
  );
  expect(e).toMatchObject({ estado: 'suspendida', soloLectura: true });
  expect(avisoSuscripcion(e)?.grave).toBe(true);
});
