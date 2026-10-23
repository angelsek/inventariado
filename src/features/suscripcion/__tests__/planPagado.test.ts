import { avisar } from '@/lib/dialogo';
import { useSesion } from '@/sesion/store';

import { calcularEstado } from '../estado';
import {
  bloqueadoSinPlanPagado,
  esPlanPagado,
  MENSAJE_PLAN_PAGADO,
  requierePlanPagado,
} from '../planPagado';
import { MENSAJE_SOLO_LECTURA } from '../useSoloLectura';

jest.mock('@/lib/dialogo', () => ({ avisar: jest.fn() }));

const DIA = 86400000;
const enDias = (dias: number) => new Date(Date.now() + dias * DIA).toISOString();

const activa = () =>
  calcularEstado({
    planId: 'basico',
    pruebaHasta: null,
    pagadoHasta: enDias(20),
    suspendida: false,
  });
const prueba = () =>
  calcularEstado({
    planId: 'basico',
    pruebaHasta: enDias(5),
    pagadoHasta: null,
    suspendida: false,
  });
const vencida = () =>
  calcularEstado({
    planId: 'basico',
    pruebaHasta: null,
    pagadoHasta: enDias(-2),
    suspendida: false,
  });
const suspendida = () =>
  calcularEstado({
    planId: 'basico',
    pruebaHasta: null,
    pagadoHasta: enDias(-30),
    suspendida: false,
  });

describe('esPlanPagado', () => {
  it('solo la suscripción activa habilita exportar', () => {
    expect(activa().estado).toBe('activa');
    expect(esPlanPagado(activa())).toBe(true);
  });

  it.each([
    ['prueba', prueba],
    ['vencida (en gracia)', vencida],
    ['suspendida', suspendida],
  ])('%s no lo habilita', (_nombre, estado) => {
    expect(esPlanPagado(estado())).toBe(false);
  });

  it('suspendida a mano por el administrador, aunque esté pagada, no lo habilita', () => {
    const e = calcularEstado({
      planId: 'basico',
      pruebaHasta: null,
      pagadoHasta: enDias(20),
      suspendida: true,
    });
    expect(esPlanPagado(e)).toBe(false);
  });

  it('sin datos todavía (null) no se habilita: es a propósito, ante la duda se bloquea', () => {
    expect(esPlanPagado(null)).toBe(false);
  });
});

describe('requierePlanPagado', () => {
  it.each(['/exportar', '/exportar?x=1', '/exportar/'])('%s pide plan pagado', (ruta) => {
    expect(requierePlanPagado(ruta)).toBe(true);
  });

  it.each(['/estadisticas', '/importar', '/inventario', '/suscripcion', '/exportarX', '/', ''])(
    '"%s" no pide plan pagado',
    (ruta) => {
      expect(requierePlanPagado(ruta)).toBe(false);
    },
  );
});

describe('bloqueadoSinPlanPagado', () => {
  beforeEach(() => {
    jest.mocked(avisar).mockClear();
    useSesion.setState({ suscripcion: null });
  });

  it('pagado: no bloquea ni avisa', () => {
    useSesion.setState({ suscripcion: activa() });
    expect(bloqueadoSinPlanPagado()).toBe(false);
    expect(avisar).not.toHaveBeenCalled();
  });

  it('en prueba: bloquea y avisa que es del plan pagado', () => {
    useSesion.setState({ suscripcion: prueba() });
    expect(bloqueadoSinPlanPagado()).toBe(true);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith('Solo con plan pagado', MENSAJE_PLAN_PAGADO);
  });

  it('vencida en gracia: bloquea con el aviso del plan pagado', () => {
    useSesion.setState({ suscripcion: vencida() });
    expect(bloqueadoSinPlanPagado()).toBe(true);
    expect(avisar).toHaveBeenCalledWith('Solo con plan pagado', MENSAJE_PLAN_PAGADO);
  });

  it('suspendida: bloquea con el aviso de solo lectura', () => {
    useSesion.setState({ suscripcion: suspendida() });
    expect(bloqueadoSinPlanPagado()).toBe(true);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith('Solo lectura', MENSAJE_SOLO_LECTURA);
  });

  it('sin datos de suscripción: bloquea con el aviso del plan pagado', () => {
    expect(bloqueadoSinPlanPagado()).toBe(true);
    expect(avisar).toHaveBeenCalledWith('Solo con plan pagado', MENSAJE_PLAN_PAGADO);
  });
});
