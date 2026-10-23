import { Platform } from 'react-native';

import { AJUSTE_DISPOSITIVO, leerAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import type { BaseLocal } from '@/db/tipos';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { respuestasRpc, supabase } from '@/test/mockSupabase';

import { crearNegocio } from '../cuenta';

jest.mock('@/lib/supabase', () => require('@/test/mockSupabase'));
jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));
jest.mock('@/sync/motor', () => ({ sincronizar: jest.fn(() => Promise.resolve()) }));
jest.mock('@/sync/remotoSupabase', () => ({ remotoSupabase: {} }));
jest.mock('../idTelefono', () => ({ idTelefonoEstable: () => Promise.resolve('id-equipo') }));

const DATOS = {
  nombreNegocio: 'Almacén Rosa',
  rut: '12.345.678-5',
  direccion: '',
  nombreDueno: 'Rosa',
  pin: '1234',
};

const rpcOriginal = supabase.rpc.getMockImplementation() as never;
let db: BaseLocal;

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  respuestasRpc.crear_negocio = { data: 'negocio-1', error: null };
  supabase.rpc.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  supabase.rpc.mockImplementation(rpcOriginal);
});

const llamadas = (nombre: string) =>
  supabase.rpc.mock.calls.filter(([n]) => n === nombre) as unknown as [
    string,
    Record<string, unknown>,
  ][];

it('manda el id del equipo como llave de la prueba y vincula ese mismo equipo', async () => {
  await crearNegocio(db, DATOS);

  // La prueba gratis es una por negocio: el servidor necesita el id del equipo al crearlo.
  expect(llamadas('crear_negocio')[0][1]).toMatchObject({
    p_nombre: 'Almacén Rosa',
    p_rut: '12.345.678-5',
    p_equipo_id: 'id-equipo',
  });
  // El equipo que se vincula después es el mismo que se usó como llave.
  expect(llamadas('registrar_dispositivo')[0][1].p_id).toBe('id-equipo');
  expect(await leerAjuste(db, AJUSTE_DISPOSITIVO)).toBe('id-equipo');
});

it('si el servidor todavía no tiene la migración, reintenta sin el id del equipo', async () => {
  supabase.rpc.mockImplementationOnce(() =>
    Promise.resolve({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' },
    }),
  );

  await crearNegocio(db, DATOS);

  const intentos = llamadas('crear_negocio');
  expect(intentos).toHaveLength(2);
  expect(intentos[1][1]).not.toHaveProperty('p_equipo_id');
  // El negocio igual queda creado y el equipo vinculado.
  expect(llamadas('registrar_dispositivo')[0][1].p_id).toBe('id-equipo');
});

it('un error de verdad no se reintenta', async () => {
  respuestasRpc.crear_negocio = {
    data: null,
    error: { code: '23505', message: 'Esta cuenta ya tiene un negocio' },
  };

  await expect(crearNegocio(db, DATOS)).rejects.toThrow('Esta cuenta ya tiene un negocio');
  expect(llamadas('crear_negocio')).toHaveLength(1);
});

it('si el servidor sigue sin conocer la función tras reintentar, el error llega a quien llama', async () => {
  respuestasRpc.crear_negocio = {
    data: null,
    error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' },
  };

  await expect(crearNegocio(db, DATOS)).rejects.toThrow('schema cache');
  expect(llamadas('crear_negocio')).toHaveLength(2);
  // Sin negocio no se vincula ningún equipo.
  expect(llamadas('registrar_dispositivo')).toHaveLength(0);
});

it('el reintento sin p_equipo_id conserva todos los demás datos del negocio', async () => {
  supabase.rpc.mockImplementationOnce(() =>
    Promise.resolve({ data: null, error: { message: 'Could not find ... in the schema cache' } }),
  );

  await crearNegocio(db, DATOS);

  const [primero, segundo] = llamadas('crear_negocio');
  const { p_equipo_id: _equipo, ...sinEquipo } = primero[1];
  expect(segundo[1]).toEqual(sinEquipo);
});

describe('el id del equipo que se manda como llave de la prueba', () => {
  // Registrar el equipo falla porque ya es de otro negocio (el teléfono lo usó otra cuenta
  // mientras su prueba corre): la app se vincula con un id nuevo, pero la llave de la prueba
  // gratis tiene que seguir siendo la del teléfono real. Si no, la próxima cuenta creada en ese
  // teléfono mandaría un id nunca visto y recibiría 7 días nuevos.
  it('sigue siendo el del teléfono aunque se haya vinculado con un id nuevo', async () => {
    supabase.rpc.mockImplementation(((nombre: string, args: { p_id?: string }) =>
      nombre === 'registrar_dispositivo' && args.p_id === 'id-equipo'
        ? Promise.resolve({ data: null, error: { message: 'DISPOSITIVO_DE_OTRO_NEGOCIO' } })
        : (rpcOriginal as (n: string) => Promise<unknown>)(nombre)) as never);

    await crearNegocio(db, DATOS);
    const vinculado = await leerAjuste(db, AJUSTE_DISPOSITIVO);
    expect(vinculado).not.toBe('id-equipo');

    supabase.rpc.mockClear();
    await crearNegocio(db, { ...DATOS, rut: '' });

    expect(llamadas('crear_negocio')[0][1].p_equipo_id).toBe('id-equipo');
  });

  it('en la web no hay id del equipo: se usa el que el navegador ya tenía', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await crearNegocio(db, DATOS);
    const propio = await leerAjuste(db, AJUSTE_DISPOSITIVO);
    expect(propio).toBe('id-equipo');

    supabase.rpc.mockClear();
    await crearNegocio(db, { ...DATOS, rut: '' });
    expect(llamadas('crear_negocio')[0][1].p_equipo_id).toBe(propio);
  });
});
