import { AJUSTE_DISPOSITIVO, AJUSTE_NEGOCIO, guardarAjuste, leerAjuste } from '@/db/ajustes';
import { registrarDispositivo } from '@/db/dispositivos';
import { migrarBaseDeDatos } from '@/db/migraciones';
import type { BaseLocal } from '@/db/tipos';
import { useSesion } from '@/sesion/store';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { crearRemotoFalso } from '@/test/remotoFalso';

import { sincronizarAhora } from '../ejecutar';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const mockRemoto = crearRemotoFalso();
// Getter: el mock se evalúa antes de que se cree mockRemoto (jest.mock se sube al inicio).
jest.mock('@/sync/remotoSupabase', () => ({
  get remotoSupabase() {
    return mockRemoto;
  },
}));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: {} } } }),
      signOut: () => Promise.resolve({}),
    },
  },
  mensajeDeError: (e: unknown) => String(e),
}));

const NEGOCIO = 'negocio-1';
let db: BaseLocal;

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  await guardarAjuste(db, AJUSTE_NEGOCIO, NEGOCIO);
  await guardarAjuste(db, AJUSTE_DISPOSITIVO, 'disp-1');
  await registrarDispositivo(db, { id: 'disp-1', negocioId: NEGOCIO, nombre: 'Samsung' });
  useSesion.setState({ negocioId: NEGOCIO, perfil: null, suscripcion: null, avisoSalida: null });
});

it('descarga la suscripción y actualiza su estado', async () => {
  const hoy = new Date().toISOString();
  mockRemoto.escribir('suscripciones', {
    id: NEGOCIO,
    negocio_id: NEGOCIO,
    plan_id: 'pro',
    prueba_hasta: new Date(Date.now() + 10 * 86400000).toISOString(),
    pagado_hasta: null,
    suspendida: false,
    notas: null,
    creado_en: hoy,
    actualizado_en: hoy,
    eliminado: false,
  });

  await sincronizarAhora(db);

  expect(useSesion.getState().sync.error).toBeNull();
  expect(useSesion.getState().sync.estado).toBe('ok');
  expect(useSesion.getState().suscripcion).toMatchObject({ estado: 'prueba', planId: 'pro' });
});

it('si otro teléfono lo desvinculó, cierra la sesión y lo avisa', async () => {
  await sincronizarAhora(db);
  // El servidor marca este teléfono como eliminado (desvincular_dispositivo).
  const [fila] = mockRemoto.filas('dispositivos');
  mockRemoto.escribir('dispositivos', { ...fila, eliminado: true });

  await sincronizarAhora(db);

  expect(useSesion.getState().negocioId).toBeNull();
  expect(useSesion.getState().avisoSalida).toBe('Este teléfono fue desvinculado del negocio.');
  expect(await leerAjuste(db, AJUSTE_NEGOCIO)).toBeNull();
});
