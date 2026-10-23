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

let db: BaseLocal;

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  respuestasRpc.crear_negocio = { data: 'negocio-1', error: null };
  supabase.rpc.mockClear();
});

afterEach(() => jest.restoreAllMocks());

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
