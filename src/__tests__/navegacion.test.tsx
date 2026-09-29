import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { useSesion } from '@/sesion/store';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

// Base SQLite real en memoria en lugar de la nativa.
let mockDb: BaseLocal;
jest.mock('expo-sqlite', () => {
  const React = jest.requireActual('react');
  return {
    SQLiteProvider: ({
      children,
      onInit,
    }: {
      children: React.ReactNode;
      onInit: (db: unknown) => Promise<void>;
    }) => {
      const [listo, setListo] = React.useState(false);
      React.useEffect(() => {
        onInit(mockDb).then(() => setListo(true));
      }, [onInit]);
      return listo ? children : null;
    },
    useSQLiteContext: () => mockDb,
  };
});

// Sin servidor: la sincronización y Supabase no se prueban aquí.
jest.mock('@/lib/supabase', () => ({
  supabaseConfigurado: true,
  supabase: {},
  mensajeDeError: (e: unknown) => String(e),
}));
jest.mock('@/sync/useSincronizacionAutomatica', () => ({ useSincronizacionAutomatica: () => {} }));

const NEGOCIO = 'negocio-1';

async function prepararBase(conNegocio: boolean) {
  mockDb = crearBaseEnMemoria();
  await migrarBaseDeDatos(mockDb);
  if (!conNegocio) return;

  const ahora = new Date().toISOString();
  await mockDb.runAsync(
    'INSERT INTO negocios (id, nombre, creado_en, actualizado_en) VALUES (?, ?, ?, ?)',
    NEGOCIO,
    'Botillería Ana',
    ahora,
    ahora,
  );
  await crearPerfil(mockDb, { negocioId: NEGOCIO, nombre: 'Ana', rol: 'dueno', pin: '1234' });
  await crearPerfil(mockDb, { negocioId: NEGOCIO, nombre: 'Carla', rol: 'cajero', pin: '5678' });
  await guardarAjuste(mockDb, AJUSTE_NEGOCIO, NEGOCIO);
}

const marcarPin = (pin: string) => {
  for (const digito of pin) fireEvent.press(screen.getByLabelText(digito));
};

beforeEach(() => {
  useSesion.setState({ cargada: false, negocioId: null, perfil: null, versionDatos: 0 });
});

it('sin negocio vinculado muestra la bienvenida', async () => {
  await prepararBase(false);
  renderRouter('src/app');

  expect(await screen.findByText('Crear mi negocio')).toBeTruthy();
  expect(screen.getByText('Ya tengo cuenta')).toBeTruthy();
});

it('con negocio pide elegir usuario y PIN antes de entrar', async () => {
  await prepararBase(true);
  renderRouter('src/app');

  expect(await screen.findByText('¿Quién eres?')).toBeTruthy();
  expect(await screen.findByText('Botillería Ana')).toBeTruthy();

  fireEvent.press(screen.getByText('Carla'));
  expect(await screen.findByText('Hola, Carla')).toBeTruthy();

  marcarPin('0000');
  expect(await screen.findByText('PIN incorrecto')).toBeTruthy();

  marcarPin('5678');
  await waitFor(() => expect(useSesion.getState().perfil?.nombre).toBe('Carla'));
  expect(await screen.findByText(/Escanea o busca productos/)).toBeTruthy();
});

it('un cajero no ve la administración de usuarios ni cerrar sesión', async () => {
  await prepararBase(true);
  renderRouter('src/app');

  fireEvent.press(await screen.findByText('Carla'));
  marcarPin('5678');
  fireEvent.press(await screen.findByText('Más'));

  expect(await screen.findByText('Cambiar de usuario')).toBeTruthy();
  expect(screen.queryByText('Usuarios y cajeros')).toBeNull();
  expect(screen.queryByText('Cerrar sesión')).toBeNull();
});

it('el dueño puede agregar un cajero', async () => {
  await prepararBase(true);
  renderRouter('src/app');

  fireEvent.press(await screen.findByText('Ana'));
  marcarPin('1234');
  fireEvent.press(await screen.findByText('Más'));
  fireEvent.press(await screen.findByText('Usuarios y cajeros'));

  fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Pedro');
  fireEvent.changeText(screen.getByLabelText('PIN (4 números)'), '4321');
  fireEvent.press(screen.getByText('Agregar cajero'));

  expect(await screen.findByText('Pedro')).toBeTruthy();
  const fila = await mockDb.getFirstAsync<{ pendiente: number }>(
    "SELECT pendiente FROM perfiles WHERE nombre = 'Pedro'",
  );
  expect(fila?.pendiente).toBe(1);
});
