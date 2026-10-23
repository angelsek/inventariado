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

describe('negocio que nació sin prueba gratis (una prueba por negocio)', () => {
  const sinPrueba = calcularEstado(
    { planId: 'pro', pruebaHasta: null, pagadoHasta: null, suspendida: false },
    AHORA,
  );

  it('queda en solo lectura, marcado como sin prueba', () => {
    expect(sinPrueba).toMatchObject({
      estado: 'suspendida',
      soloLectura: true,
      sinPrueba: true,
      venceEn: null,
    });
  });

  it('el aviso explica que la prueba ya se usó, no que la suscripción se suspendió', () => {
    expect(avisoSuscripcion(sinPrueba)).toEqual({
      texto: 'Este negocio ya usó su prueba gratis. Toca para ver los planes.',
      grave: true,
    });
  });

  it('una suspensión de verdad no se marca como sin prueba', () => {
    const suspendida = calcularEstado(
      { planId: 'pro', pruebaHasta: dias(-30), pagadoHasta: null, suspendida: true },
      AHORA,
    );
    expect(suspendida.sinPrueba).toBe(false);
    expect(avisoSuscripcion(suspendida)?.texto).toContain('Suscripción suspendida');

    // La prueba que se usó y venció tampoco: ahí sí hubo una suscripción.
    const vencidaHaceRato = calcularEstado(
      { planId: 'pro', pruebaHasta: dias(-30), pagadoHasta: null, suspendida: false },
      AHORA,
    );
    expect(vencidaHaceRato.sinPrueba).toBe(false);
  });
});

describe('sinPrueba: solo el negocio que nunca tuvo prueba ni pago', () => {
  const calcular = (pruebaHasta: string | null, pagadoHasta: string | null, suspendida = false) =>
    calcularEstado({ planId: 'pro', pruebaHasta, pagadoHasta, suspendida }, AHORA);

  it('una suspensión manual sin fechas sigue siendo una suspensión, no "sin prueba"', () => {
    const e = calcular(null, null, true);
    expect(e).toMatchObject({ estado: 'suspendida', soloLectura: true, sinPrueba: false });
    expect(avisoSuscripcion(e)?.texto).toContain('Suscripción suspendida');
  });

  it('un negocio que pagó nunca se marca sin prueba, aunque no tenga fecha de prueba', () => {
    // Pagó y está al día (por ejemplo, un cliente que entró directo por Google Play).
    expect(calcular(null, dias(20))).toMatchObject({ estado: 'activa', sinPrueba: false });
    // Pagó, no renovó y ya pasaron los 7 días de gracia: suspendido de verdad.
    const lapsado = calcular(null, dias(-30));
    expect(lapsado).toMatchObject({ estado: 'suspendida', soloLectura: true, sinPrueba: false });
    expect(avisoSuscripcion(lapsado)?.texto).toContain('Suscripción suspendida');
  });

  it('con prueba vigente o en gracia tampoco', () => {
    expect(calcular(dias(3), null).sinPrueba).toBe(false);
    expect(calcular(dias(-2), null)).toMatchObject({ estado: 'vencida', sinPrueba: false });
  });

  it('el borde: una prueba que termina justo ahora todavía vale', () => {
    expect(calcular(AHORA.toISOString(), null)).toMatchObject({
      estado: 'prueba',
      sinPrueba: false,
    });
  });

  it('no deja pasar a vender: solo lectura y sin fecha de vencimiento', () => {
    const e = calcular(null, null);
    expect(e).toMatchObject({
      soloLectura: true,
      venceEn: null,
      diasRestantes: null,
      diasGracia: null,
    });
  });
});
