import { migrarBaseDeDatos } from '@/db/migraciones';
import type { BaseLocal } from '@/db/tipos';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { supabase } from '@/test/mockSupabase';

import { crearCuentaYNegocio } from '../cuenta';

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
  supabase.auth.signUp.mockClear();
  supabase.rpc.mockClear();
});

it('el enlace del correo de confirmación vuelve a la página de Stockeao', async () => {
  await crearCuentaYNegocio(db, '  rosa@ejemplo.cl ', 'clave-segura', DATOS);

  // Sin esto Supabase usa el Site URL del proyecto, que es de otra app.
  expect(supabase.auth.signUp).toHaveBeenCalledWith({
    email: 'rosa@ejemplo.cl',
    password: 'clave-segura',
    options: { emailRedirectTo: 'https://grimoriolabs.com/stockeao/' },
  });
});

it('sin sesión pide confirmar el correo y no crea el negocio todavía', async () => {
  const resultado = await crearCuentaYNegocio(db, 'rosa@ejemplo.cl', 'clave-segura', DATOS);

  expect(resultado).toEqual({ tipo: 'confirmar_correo' });
  expect(supabase.rpc).not.toHaveBeenCalledWith('crear_negocio', expect.anything());
});

it('si el correo ya tenía cuenta lo avisa', async () => {
  supabase.auth.signUp.mockResolvedValueOnce({
    data: { user: { identities: [] }, session: null },
    error: null,
  } as never);

  const resultado = await crearCuentaYNegocio(db, 'rosa@ejemplo.cl', 'clave-segura', DATOS);

  expect(resultado).toEqual({ tipo: 'cuenta_existente' });
});
