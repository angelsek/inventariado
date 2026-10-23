import { router } from 'expo-router';

import { avisar } from '@/lib/dialogo';
import { useSesion } from '@/sesion/store';

import { calcularEstado } from '../estado';
import { avisarSiNacioSinPrueba } from '../sinPrueba';
import { bloqueadoPorSuscripcion } from '../useSoloLectura';

jest.mock('@/lib/dialogo', () => ({ avisar: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const estado = (pruebaHasta: string | null, suspendida = false) =>
  calcularEstado({ planId: 'pro', pruebaHasta, pagadoHasta: null, suspendida });

beforeEach(() => {
  jest.clearAllMocks();
  useSesion.getState().fijarSuscripcion(null);
});

it('al crear el negocio sin prueba, avisa y ofrece ver los planes', () => {
  useSesion.getState().fijarSuscripcion(estado(null));

  expect(avisarSiNacioSinPrueba()).toBe(true);
  const [titulo, mensaje, botones] = (avisar as jest.Mock).mock.calls[0];
  expect(titulo).toBe('Sin prueba gratis');
  expect(mensaje).toContain('una por negocio');
  botones.find((b: { text: string }) => b.text === 'Ver planes').onPress();
  expect(router.push).toHaveBeenCalledWith('/suscripcion');
});

it('con prueba vigente no molesta a nadie', () => {
  useSesion.getState().fijarSuscripcion(estado(new Date(Date.now() + 86400000).toISOString()));
  expect(avisarSiNacioSinPrueba()).toBe(false);
  expect(avisar).not.toHaveBeenCalled();
});

it('al intentar vender, el mensaje habla de la prueba y no de una suspensión', () => {
  useSesion.getState().fijarSuscripcion(estado(null));
  expect(bloqueadoPorSuscripcion()).toBe(true);
  expect((avisar as jest.Mock).mock.calls[0][0]).toBe('Sin prueba gratis');

  // Una suspensión de verdad conserva su mensaje de siempre.
  jest.clearAllMocks();
  useSesion.getState().fijarSuscripcion(estado(null, true));
  expect(bloqueadoPorSuscripcion()).toBe(true);
  expect((avisar as jest.Mock).mock.calls[0][0]).toBe('Solo lectura');
});
