const { describe, expect, it } = require('@jest/globals');

const { avisosRaiz, evaluar } = require('../auditar-dependencias');

const HOY = '2026-10-02';
const url = (ghsa) => `https://github.com/advisories/${ghsa}`;

const GHSA_A = 'GHSA-aaaa-bbbb-cccc';
const GHSA_B = 'GHSA-1111-2222-3333';

function via(ghsa, { name, severity = 'high', title = 'Titulo de prueba' } = {}) {
  return { source: 1, name, title, url: url(ghsa), severity, range: '<1.0.0' };
}

function auditCon(vulnerabilities) {
  return { vulnerabilities };
}

describe('avisosRaiz', () => {
  it('devuelve un mapa vacío sin vulnerabilidades', () => {
    expect(avisosRaiz(auditCon({})).size).toBe(0);
    expect(avisosRaiz(null).size).toBe(0);
    expect(avisosRaiz({}).size).toBe(0);
  });

  it('agrupa por GHSA extraído de la url', () => {
    const avisos = avisosRaiz(
      auditCon({
        uno: { severity: 'high', via: [via(GHSA_A, { name: 'uno', title: 'Falla A' })] },
        dos: { severity: 'low', via: [via(GHSA_B, { name: 'dos', severity: 'low' })] },
      }),
    );
    expect([...avisos.keys()].sort()).toEqual([GHSA_B, GHSA_A].sort());
    expect(avisos.get(GHSA_A)).toMatchObject({
      ghsa: GHSA_A,
      severidad: 'high',
      titulo: 'Falla A',
    });
  });

  it('ignora las vías string (paquetes intermedios)', () => {
    const avisos = avisosRaiz(
      auditCon({
        raiz: { severity: 'high', via: [via(GHSA_A, { name: 'raiz' })] },
        intermedio: { severity: 'high', via: ['raiz'] },
      }),
    );
    expect(avisos.size).toBe(1);
    expect([...avisos.get(GHSA_A).paquetes]).toEqual(['raiz']);
  });

  it('junta los paquetes que comparten el mismo GHSA', () => {
    const avisos = avisosRaiz(
      auditCon({
        uno: { severity: 'high', via: [via(GHSA_A, { name: 'uno' })] },
        dos: { severity: 'high', via: [via(GHSA_A, { name: 'dos' })] },
      }),
    );
    expect(avisos.size).toBe(1);
    expect([...avisos.get(GHSA_A).paquetes].sort()).toEqual(['dos', 'uno']);
  });

  it('usa el nombre del paquete cuando la vía no trae name', () => {
    const avisos = avisosRaiz(
      auditCon({ sinNombre: { severity: 'high', via: [via(GHSA_A, {})] } }),
    );
    expect([...avisos.get(GHSA_A).paquetes]).toEqual(['sinNombre']);
  });

  it('ignora las vías sin url GHSA', () => {
    const avisos = avisosRaiz(
      auditCon({
        a: { severity: 'high', via: [{ name: 'a', title: 'x', severity: 'high' }] },
        b: {
          severity: 'high',
          via: [{ name: 'b', url: 'https://example.com/otro', severity: 'high' }],
        },
        c: { severity: 'high' },
      }),
    );
    expect(avisos.size).toBe(0);
  });
});

describe('evaluar', () => {
  const excepcion = (ghsa, extra = {}) => ({
    ghsa,
    paquete: 'uno',
    revisar_antes: '2027-01-01',
    ...extra,
  });

  it('sin vulnerabilidades no da errores ni avisos', () => {
    expect(evaluar(auditCon({}), [], HOY)).toEqual({ errores: [], avisos: [] });
    expect(evaluar(auditCon({}), [], HOY, { estricto: true })).toEqual({
      errores: [],
      avisos: [],
    });
  });

  it('con solo vulnerabilidades exceptuadas (incluidos intermedios) no da nada', () => {
    const audit = auditCon({
      uno: { severity: 'high', via: [via(GHSA_A, { name: 'uno' })] },
      intermedio: { severity: 'high', via: ['uno'] },
    });
    const r = evaluar(audit, [excepcion(GHSA_A)], HOY, { estricto: true });
    expect(r).toEqual({ errores: [], avisos: [] });
  });

  it('un GHSA nuevo moderado o mayor es aviso en modo informativo', () => {
    for (const severity of ['moderate', 'high', 'critical']) {
      const audit = auditCon({ uno: { severity, via: [via(GHSA_A, { name: 'uno', severity })] } });
      const r = evaluar(audit, [], HOY);
      expect(r.errores).toEqual([]);
      expect(r.avisos).toHaveLength(1);
      expect(r.avisos[0]).toContain(GHSA_A);
      expect(r.avisos[0]).toContain('nueva');
    }
  });

  it('un GHSA nuevo moderado o mayor es error en modo estricto', () => {
    const audit = auditCon({ uno: { severity: 'high', via: [via(GHSA_A, { name: 'uno' })] } });
    const r = evaluar(audit, [], HOY, { estricto: true });
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toContain(GHSA_A);
    expect(r.avisos).toEqual([]);
  });

  it('un GHSA nuevo low (o info) se ignora', () => {
    for (const severity of ['low', 'info']) {
      const audit = auditCon({ uno: { severity, via: [via(GHSA_A, { name: 'uno', severity })] } });
      expect(evaluar(audit, [], HOY, { estricto: true })).toEqual({ errores: [], avisos: [] });
    }
  });

  it('una excepción vencida (revisar_antes < hoy) da aviso, también en estricto', () => {
    const audit = auditCon({ uno: { severity: 'high', via: [via(GHSA_A, { name: 'uno' })] } });
    const vencida = excepcion(GHSA_A, { revisar_antes: '2026-10-01' });
    for (const estricto of [false, true]) {
      const r = evaluar(audit, [vencida], HOY, { estricto });
      expect(r.errores).toEqual([]);
      expect(r.avisos).toHaveLength(1);
      expect(r.avisos[0]).toContain('vencida');
    }
  });

  it('una excepción que vence hoy todavía no está vencida', () => {
    const audit = auditCon({ uno: { severity: 'high', via: [via(GHSA_A, { name: 'uno' })] } });
    const r = evaluar(audit, [excepcion(GHSA_A, { revisar_antes: HOY })], HOY);
    expect(r).toEqual({ errores: [], avisos: [] });
  });

  it('una excepción sin revisar_antes nunca vence', () => {
    const audit = auditCon({ uno: { severity: 'high', via: [via(GHSA_A, { name: 'uno' })] } });
    const r = evaluar(audit, [excepcion(GHSA_A, { revisar_antes: undefined })], HOY);
    expect(r).toEqual({ errores: [], avisos: [] });
  });

  it('una excepción que ya no aparece da aviso (nunca error)', () => {
    const audit = auditCon({ uno: { severity: 'high', via: [via(GHSA_A, { name: 'uno' })] } });
    const r = evaluar(audit, [excepcion(GHSA_A), excepcion(GHSA_B)], HOY, { estricto: true });
    expect(r.errores).toEqual([]);
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos[0]).toContain(GHSA_B);
    expect(r.avisos[0]).toContain('ya no aparece');
  });

  it('un audit nulo o sin vulnerabilities es aviso en informativo y error en estricto', () => {
    for (const audit of [null, undefined, {}, 'texto', { error: 'fallo' }]) {
      const info = evaluar(audit, [excepcion(GHSA_A)], HOY);
      expect(info.errores).toEqual([]);
      expect(info.avisos).toHaveLength(1);
      expect(info.avisos[0]).toContain('No se pudo leer');

      const estricto = evaluar(audit, [excepcion(GHSA_A)], HOY, { estricto: true });
      expect(estricto.errores).toHaveLength(1);
      expect(estricto.avisos).toEqual([]);
    }
  });
});
