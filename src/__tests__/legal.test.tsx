import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { useSesion } from '@/sesion/store';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { PERMISOS_CAJERO } from '@/test/personas';

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

jest.mock('@/lib/supabase', () => require('@/test/mockSupabase'));
jest.mock('@/sync/useSincronizacionAutomatica', () => ({ useSincronizacionAutomatica: () => {} }));

// Frases que solo aparecen en un documento.
const ELIMINAR = /Se borran el negocio, sus usuarios y equipos/;
const TERMINOS = /Stockeao es una aplicación para administrar el inventario/;
const PRIVACIDAD = /Política de privacidad de Stockeao/;

beforeEach(async () => {
  mockDb = crearBaseEnMemoria();
  await migrarBaseDeDatos(mockDb);
  useSesion.setState({ cargada: false, negocioId: null, perfil: null, versionDatos: 0 });
});

// Es la URL que revisa Google Play: se abre sin cuenta y sin negocio vinculado.
it('/legal/eliminar-cuenta muestra cómo eliminar la cuenta, sin sesión', async () => {
  renderRouter('src/app', { initialUrl: '/legal/eliminar-cuenta' });

  expect(await screen.findByText(ELIMINAR)).toBeTruthy();
  expect(screen.queryByText(TERMINOS)).toBeNull();
});

it('/legal/terminos y /legal/privacidad muestran cada uno lo suyo', async () => {
  renderRouter('src/app', { initialUrl: '/legal/terminos' });
  expect(await screen.findByText(TERMINOS)).toBeTruthy();
  expect(screen.queryByText(ELIMINAR)).toBeNull();

  screen.unmount();

  renderRouter('src/app', { initialUrl: '/legal/privacidad' });
  expect(await screen.findByText(PRIVACIDAD)).toBeTruthy();
  expect(screen.queryByText(ELIMINAR)).toBeNull();
});

// Antes cualquier dirección bajo /legal mostraba los Términos en silencio.
it('una dirección inventada bajo /legal avisa que no existe', async () => {
  renderRouter('src/app', { initialUrl: '/legal/inventado' });

  expect(await screen.findByText('No encontramos esa página')).toBeTruthy();
  expect(screen.queryByText(TERMINOS)).toBeNull();
});

// --- Con negocio vinculado: las páginas informativas no dependen de la sesión ---

async function prepararNegocio() {
  const ahora = new Date().toISOString();
  await mockDb.runAsync(
    'INSERT INTO negocios (id, nombre, creado_en, actualizado_en) VALUES (?, ?, ?, ?)',
    'negocio-1',
    'Botillería Ana',
    ahora,
    ahora,
  );
  await crearPerfil(mockDb, { negocioId: 'negocio-1', nombre: 'Ana', rol: 'dueno', pin: '1234' });
  await crearPerfil(mockDb, {
    negocioId: 'negocio-1',
    nombre: 'Carla',
    rol: 'cajero',
    pin: '5678',
    permisos: PERMISOS_CAJERO,
  });
  await guardarAjuste(mockDb, AJUSTE_NEGOCIO, 'negocio-1');
}

const marcarPin = (pin: string) => {
  for (const digito of pin) fireEvent.press(screen.getByLabelText(digito));
};

async function entrarComo(nombre: string, pin: string) {
  await prepararNegocio();
  renderRouter('src/app');
  fireEvent.press(await screen.findByText(nombre));
  marcarPin(pin);
  await waitFor(() => expect(useSesion.getState().perfil?.nombre).toBe(nombre));
}

it('con negocio pero sin elegir persona (pantalla del PIN) también se lee la página', async () => {
  await prepararNegocio();
  renderRouter('src/app', { initialUrl: '/legal/eliminar-cuenta' });

  expect(await screen.findByText(ELIMINAR)).toBeTruthy();
  expect(screen.queryByText('¿Quién eres?')).toBeNull();
});

it('con sesión iniciada, /legal/eliminar-cuenta sigue siendo solo informativa', async () => {
  await entrarComo('Carla', '5678');

  act(() => router.push('/legal/eliminar-cuenta'));

  expect(await screen.findByText(ELIMINAR)).toBeTruthy();
  // No es la pantalla que borra el negocio.
  expect(screen.queryByLabelText('Contraseña de la cuenta')).toBeNull();
});

it('la pantalla que borra el negocio sigue protegida por el permiso', async () => {
  await entrarComo('Carla', '5678');

  act(() => router.push('/eliminar-cuenta'));

  // Un cajero no la abre.
  await waitFor(() => expect(screen.queryByLabelText('Contraseña de la cuenta')).toBeNull());
  expect(screen.queryByText('Eliminar cuenta y datos')).toBeNull();
  expect(screen.queryByText(ELIMINAR)).toBeNull();
});

it('el dueño sí abre la pantalla que borra el negocio, distinta de la página informativa', async () => {
  await entrarComo('Ana', '1234');

  act(() => router.push('/eliminar-cuenta'));

  expect(await screen.findByLabelText('Contraseña de la cuenta')).toBeTruthy();
  expect(screen.queryByText(ELIMINAR)).toBeNull();
});

it('los enlaces de Crear cuenta llevan a cada documento', async () => {
  renderRouter('src/app', { initialUrl: '/crear-cuenta' });
  fireEvent.press(await screen.findByText('Términos y condiciones'));
  expect(await screen.findByText(TERMINOS)).toBeTruthy();

  screen.unmount();

  renderRouter('src/app', { initialUrl: '/crear-cuenta' });
  fireEvent.press(await screen.findByText('Política de privacidad'));
  expect(await screen.findByText(PRIVACIDAD)).toBeTruthy();
});
