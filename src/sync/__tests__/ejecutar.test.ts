import { AJUSTE_DISPOSITIVO, AJUSTE_NEGOCIO, guardarAjuste, leerAjuste } from '@/db/ajustes';
import { registrarDispositivo } from '@/db/dispositivos';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { obtenerPerfil } from '@/db/perfiles';
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
  useSesion.setState({
    negocioId: NEGOCIO,
    perfil: null,
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

describe('perfil de la sesión tras sincronizar', () => {
  const AHORA = '2026-10-19T10:00:00.000Z';
  const perfilRemoto = (permisos: string[], extra: Record<string, unknown> = {}) => ({
    id: 'perfil-beto',
    negocio_id: NEGOCIO,
    nombre: 'Beto',
    rol: 'cajero',
    permisos,
    pin_hash: 'h',
    activo: true,
    creado_en: AHORA,
    actualizado_en: AHORA,
    eliminado: false,
    ...extra,
  });

  /** Beto ya sincronizó y está usando la app con sus permisos. */
  async function betoEnSesion(permisos: string[]) {
    mockRemoto.escribir('perfiles', perfilRemoto(permisos));
    await sincronizarAhora(db);
    const beto = (await obtenerPerfil(db, 'perfil-beto'))!;
    useSesion.getState().entrar(beto);
  }

  it('si el dueño le cambió los permisos, la sesión los aplica sin cerrarse', async () => {
    await betoEnSesion(['stock']);
    expect(useSesion.getState().perfil?.permisos).toEqual(['stock']);

    mockRemoto.escribir('perfiles', perfilRemoto(['reportes', 'stock']));
    await sincronizarAhora(db);

    expect(useSesion.getState().perfil?.nombre).toBe('Beto');
    expect(useSesion.getState().perfil?.permisos).toEqual(['stock', 'reportes']); // orden del catálogo
  });

  it('si le cambiaron el nombre, la sesión lo muestra', async () => {
    await betoEnSesion(['stock']);

    mockRemoto.escribir('perfiles', perfilRemoto(['stock'], { nombre: 'Alberto' }));
    await sincronizarAhora(db);

    expect(useSesion.getState().perfil?.nombre).toBe('Alberto');
  });

  it('si no cambia nada, no vuelve a dibujar la app (el perfil conserva su identidad)', async () => {
    await betoEnSesion(['stock']);
    const antes = useSesion.getState().perfil;
    const original = useSesion.getState().refrescarPerfil;
    const refrescar = jest.fn();
    useSesion.setState({ refrescarPerfil: refrescar });

    await sincronizarAhora(db);
    // Otra sincronización con la misma fila en el servidor.
    mockRemoto.escribir('perfiles', perfilRemoto(['stock']));
    await sincronizarAhora(db);

    useSesion.setState({ refrescarPerfil: original });
    expect(refrescar).not.toHaveBeenCalled();
    expect(useSesion.getState().perfil).toBe(antes);
  });

  it('si desactivaron a la persona, la sesión se cierra', async () => {
    await betoEnSesion(['stock']);

    mockRemoto.escribir('perfiles', perfilRemoto(['stock'], { activo: false }));
    await sincronizarAhora(db);

    expect(useSesion.getState().perfil).toBeNull();
  });

  it('si la persona ya no existe en la base, la sesión se cierra', async () => {
    await betoEnSesion(['stock']);
    mockRemoto.escribir('perfiles', perfilRemoto(['stock'], { eliminado: true }));

    await sincronizarAhora(db);

    expect(useSesion.getState().perfil).toBeNull();
  });

  it('sin nadie en sesión no inventa un perfil', async () => {
    mockRemoto.escribir('perfiles', perfilRemoto([]));
    await sincronizarAhora(db);
    expect(useSesion.getState().perfil).toBeNull();
  });
});
