import { AJUSTE_DISPOSITIVO, AJUSTE_NEGOCIO, guardarAjuste, leerAjuste } from '@/db/ajustes';
import { registrarDispositivo } from '@/db/dispositivos';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { obtenerPerfil } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { cargarRolSesion } from '@/sesion/permisos';
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
  useSesion.setState({
    negocioId: NEGOCIO,
    perfil: null,
    rol: null,
    suscripcion: null,
    avisoSalida: null,
  });
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
  expect(useSesion.getState().avisoSalida).toBe('Este equipo fue desvinculado del negocio.');
  expect(await leerAjuste(db, AJUSTE_NEGOCIO)).toBeNull();
});

describe('perfil y rol de la sesión tras sincronizar', () => {
  const AHORA = '2026-10-19T10:00:00.000Z';
  const rolRemoto = (id: string, nombre: string, permisos: string[], eliminado = false) => ({
    id,
    negocio_id: NEGOCIO,
    nombre,
    permisos,
    predefinido: null,
    creado_en: AHORA,
    actualizado_en: AHORA,
    eliminado,
  });
  const perfilRemoto = (rolId: string | null, extra: Record<string, unknown> = {}) => ({
    id: 'perfil-beto',
    negocio_id: NEGOCIO,
    nombre: 'Beto',
    rol: 'cajero',
    rol_id: rolId,
    pin_hash: 'h',
    activo: true,
    creado_en: AHORA,
    actualizado_en: AHORA,
    eliminado: false,
    ...extra,
  });

  /** Beto ya sincronizó y está usando la app con su rol. */
  async function betoEnSesion(rolId: string | null) {
    mockRemoto.escribir('perfiles', perfilRemoto(rolId));
    await sincronizarAhora(db);
    const beto = (await obtenerPerfil(db, 'perfil-beto'))!;
    useSesion.getState().entrar(beto, await cargarRolSesion(db, beto));
  }

  it('si el dueño le cambió el rol, la sesión queda con el rol nuevo', async () => {
    mockRemoto.escribir('roles', rolRemoto('rol-a', 'Bodeguero', ['stock']));
    mockRemoto.escribir('roles', rolRemoto('rol-b', 'Supervisor', ['reportes', 'stock']));
    await betoEnSesion('rol-a');
    expect(useSesion.getState().rol).toMatchObject({ nombre: 'Bodeguero', permisos: ['stock'] });

    mockRemoto.escribir('perfiles', perfilRemoto('rol-b'));
    await sincronizarAhora(db);

    expect(useSesion.getState().perfil?.rol_id).toBe('rol-b');
    expect(useSesion.getState().rol).toEqual({
      nombre: 'Supervisor',
      permisos: ['stock', 'reportes'], // en el orden del catálogo
      eliminado: false,
    });
  });

  it('si cambian los permisos de su rol, la sesión los aplica sin cerrarse', async () => {
    mockRemoto.escribir('roles', rolRemoto('rol-a', 'Bodeguero', ['stock']));
    await betoEnSesion('rol-a');

    mockRemoto.escribir('roles', rolRemoto('rol-a', 'Bodeguero', ['stock', 'reportes']));
    await sincronizarAhora(db);

    expect(useSesion.getState().perfil?.nombre).toBe('Beto');
    expect(useSesion.getState().rol?.permisos).toEqual(['stock', 'reportes']);
  });

  it('si su rol fue eliminado, la sesión lo marca eliminado (queda como Cajero)', async () => {
    mockRemoto.escribir('roles', rolRemoto('rol-a', 'Bodeguero', ['stock']));
    await betoEnSesion('rol-a');

    mockRemoto.escribir('roles', rolRemoto('rol-a', 'Bodeguero', ['stock'], true));
    await sincronizarAhora(db);

    expect(useSesion.getState().rol?.eliminado).toBe(true);
  });

  it('si desactivaron a la persona, la sesión se cierra', async () => {
    await betoEnSesion(null);

    mockRemoto.escribir('perfiles', perfilRemoto(null, { activo: false }));
    await sincronizarAhora(db);

    expect(useSesion.getState().perfil).toBeNull();
    expect(useSesion.getState().rol).toBeNull();
  });

  it('sin nadie en sesión no inventa un perfil', async () => {
    mockRemoto.escribir('perfiles', perfilRemoto(null));
    await sincronizarAhora(db);
    expect(useSesion.getState().perfil).toBeNull();
  });
});
