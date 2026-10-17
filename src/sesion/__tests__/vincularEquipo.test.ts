import { Platform } from 'react-native';

import { AJUSTE_DISPOSITIVO, leerAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import type { BaseLocal } from '@/db/tipos';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { respuestasRpc, respuestasTabla, supabase } from '@/test/mockSupabase';

import { iniciarSesion } from '../cuenta';

jest.mock('@/lib/supabase', () => require('@/test/mockSupabase'));
jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));
jest.mock('@/sync/motor', () => ({ sincronizar: jest.fn(() => Promise.resolve()) }));
jest.mock('@/sync/remotoSupabase', () => ({ remotoSupabase: {} }));
jest.mock('../idTelefono', () => ({ idTelefonoEstable: () => Promise.resolve('id-nuevo') }));

const NEGOCIO = 'negocio-1';
let db: BaseLocal;

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  respuestasTabla.negocio_usuarios = { data: { negocio_id: NEGOCIO }, error: null };
  delete respuestasRpc.mis_dispositivos;
  supabase.rpc.mockClear();
});

afterEach(() => jest.restoreAllMocks());

const llamadaRegistrar = () =>
  supabase.rpc.mock.calls.find(([nombre]) => nombre === 'registrar_dispositivo') as unknown as [
    string,
    Record<string, unknown>,
  ];

it('el teléfono se registra sin p_tipo (funciona con servidores sin la migración)', async () => {
  await iniciarSesion(db, 'ana@ejemplo.cl', 'clave');
  const [, params] = llamadaRegistrar();
  expect(params).not.toHaveProperty('p_tipo');
  expect(params.p_id).toBe('id-nuevo');
});

describe('en la web (PC)', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'web');
  });

  it('se registra como pc con el nombre que escribió el dueño', async () => {
    await iniciarSesion(db, 'ana@ejemplo.cl', 'clave', { nombre: '  PC mesón ' });
    const [, params] = llamadaRegistrar();
    expect(params).toMatchObject({ p_id: 'id-nuevo', p_nombre: 'PC mesón', p_tipo: 'pc' });
  });

  it('si el negocio ya tiene PC, puede reemplazar uno y reutiliza su id', async () => {
    respuestasRpc.mis_dispositivos = {
      data: {
        limite: 2,
        dispositivos: [
          { id: 'tel-1', nombre: 'Samsung', tipo: 'telefono', ultimo_sync: null },
          { id: 'pc-viejo', nombre: 'PC mesón', tipo: 'pc', ultimo_sync: null },
        ],
      },
      error: null,
    };
    const elegirReemplazo = jest.fn(() => Promise.resolve('pc-viejo'));
    await iniciarSesion(db, 'ana@ejemplo.cl', 'clave', { nombre: 'PC mesón', elegirReemplazo });

    // Solo se ofrecen los PC, no los teléfonos.
    expect(elegirReemplazo).toHaveBeenCalledWith([
      { id: 'pc-viejo', nombre: 'PC mesón', ultimo_sync: null },
    ]);
    expect(llamadaRegistrar()[1].p_id).toBe('pc-viejo');
    expect(await leerAjuste(db, AJUSTE_DISPOSITIVO)).toBe('pc-viejo');
  });

  it('un PC que ya tenía id en este navegador no pregunta por reemplazo', async () => {
    await iniciarSesion(db, 'ana@ejemplo.cl', 'clave', { nombre: 'PC' });
    const elegirReemplazo = jest.fn(() => Promise.resolve(null));
    await iniciarSesion(db, 'ana@ejemplo.cl', 'clave', { nombre: 'PC', elegirReemplazo });
    expect(elegirReemplazo).not.toHaveBeenCalled();
  });
});
