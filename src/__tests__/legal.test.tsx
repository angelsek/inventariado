import { renderRouter, screen } from 'expo-router/testing-library';

import { migrarBaseDeDatos } from '@/db/migraciones';
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
