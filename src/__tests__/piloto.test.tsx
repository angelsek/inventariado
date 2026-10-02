import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { useActualizacion } from '@/features/actualizacion/actualizacion';
import { descargarEInstalar } from '@/features/actualizacion/instalar';
import { informarError } from '@/lib/errores';
import { useSesion } from '@/sesion/store';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { respuestasRpc, respuestasTabla, supabase } from '@/test/mockSupabase';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));
jest.mock('@/features/actualizacion/instalar', () => ({
  descargarEInstalar: jest.fn(async (_url: string, _codigo: number, alAvanzar) => alAvanzar(1)),
  limpiarDescargas: jest.fn(),
}));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '0.1.0',
  nativeBuildVersion: '12',
}));

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
jest.mock('@/sync/ejecutar', () => ({ sincronizarAhora: jest.fn(() => Promise.resolve()) }));

const NEGOCIO = 'negocio-1';

beforeEach(async () => {
  useSesion.setState({
    cargada: false,
    negocioId: null,
    perfil: null,
    versionDatos: 0,
    suscripcion: null,
  });
  useActualizacion.setState({ nueva: null });
  for (const k of Object.keys(respuestasRpc)) delete respuestasRpc[k];
  for (const k of Object.keys(respuestasTabla)) delete respuestasTabla[k];
  jest.clearAllMocks();
  mockDb = crearBaseEnMemoria();
  await migrarBaseDeDatos(mockDb);
  const ahora = new Date().toISOString();
  await mockDb.runAsync(
    'INSERT INTO negocios (id, nombre, creado_en, actualizado_en) VALUES (?, ?, ?, ?)',
    NEGOCIO,
    'Botillería Ana',
    ahora,
    ahora,
  );
  await crearPerfil(mockDb, { negocioId: NEGOCIO, nombre: 'Ana', rol: 'dueno', pin: '1234' });
  await guardarAjuste(mockDb, AJUSTE_NEGOCIO, NEGOCIO);
});

afterEach(() => jest.restoreAllMocks());

async function entrar() {
  renderRouter('src/app');
  fireEvent.press(await screen.findByText('Ana'));
  for (const digito of '1234') fireEvent.press(screen.getByLabelText(digito));
  fireEvent.press(await screen.findByLabelText('Vender'));
  await screen.findByText(/Escanea o busca productos/);
}

it('avisa cuando hay un APK más nuevo y lo instala con un toque', async () => {
  respuestasRpc.ultima_version = {
    data: {
      version_code: 15,
      version: '0.1.1',
      url: 'https://x/apk/inventariado.apk',
      notas: null,
      obligatoria: false,
    },
    error: null,
  };
  await entrar();

  await screen.findByText(/Hay una versión nueva \(0\.1\.1\)/);
  fireEvent.press(screen.getByText('Actualizar'));
  await waitFor(() =>
    expect(descargarEInstalar).toHaveBeenCalledWith(
      'https://x/apk/inventariado.apk',
      15,
      expect.any(Function),
    ),
  );
  await waitFor(() => expect(useActualizacion.getState().progreso).toBeNull());

  fireEvent.press(screen.getByText('Más'));
  expect(await screen.findByText('Versión 0.1.0 (12)')).toBeTruthy();
  expect(screen.getByText('Actualizar a la versión 0.1.1 (15)')).toBeTruthy();
});

it('si la descarga falla ofrece abrirla en el navegador', async () => {
  jest.mocked(descargarEInstalar).mockRejectedValueOnce(new Error('sin señal'));
  const alerta = jest.spyOn(Alert, 'alert');
  respuestasRpc.ultima_version = {
    data: {
      version_code: 15,
      version: '0.1.1',
      url: 'https://x/a.apk',
      notas: null,
      obligatoria: false,
    },
    error: null,
  };
  await entrar();

  fireEvent.press(await screen.findByText('Actualizar'));
  await waitFor(() => expect(alerta).toHaveBeenCalled());
  expect(alerta.mock.calls[0][0]).toBe('No se pudo descargar');
  expect(useActualizacion.getState().progreso).toBeNull();
});

it('sin versión nueva no muestra aviso', async () => {
  respuestasRpc.ultima_version = {
    data: { version_code: 12, version: '0.1.0', url: 'x', notas: null, obligatoria: false },
    error: null,
  };
  await entrar();
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('ultima_version'));
  expect(screen.queryByText(/Hay una versión nueva/)).toBeNull();
});

it('envía un comentario con el perfil y la versión', async () => {
  await entrar();
  fireEvent.press(screen.getByText('Más'));
  fireEvent.press(await screen.findByText('Enviar comentario o problema'));
  fireEvent.changeText(await screen.findByLabelText('Comentario'), 'Faltan reportes por hora');
  fireEvent.press(screen.getByText('Enviar'));

  expect(await screen.findByText('¡Gracias! Recibimos tu comentario.')).toBeTruthy();
  expect(supabase.rpc).toHaveBeenCalledWith('enviar_comentario', {
    p_negocio_id: NEGOCIO,
    p_texto: 'Faltan reportes por hora',
    p_perfil: 'Ana',
    p_version: '0.1.0 (12)',
  });
});

it('el administrador ve comentarios y errores', async () => {
  respuestasRpc.es_admin = { data: true, error: null };
  respuestasRpc.admin_listar_negocios = { data: [], error: null };
  respuestasRpc.admin_listar_reportes = {
    data: {
      comentarios: [
        {
          id: 'c1',
          negocio: 'Minimarket Dani',
          perfil: 'Dani',
          version: '0.1.0 (12)',
          texto: 'Me encanta el escáner',
          leido: false,
          creado_en: new Date().toISOString(),
        },
      ],
      errores: [
        {
          id: 'e1',
          negocio: 'Minimarket Dani',
          version: '0.1.0 (12)',
          dispositivo: 'Motorola',
          mensaje: 'Pantalla: undefined is not a function',
          detalle: 'at Cobrar',
          creado_en: new Date().toISOString(),
        },
      ],
    },
    error: null,
  };
  await entrar();
  fireEvent.press(screen.getByText('Más'));
  fireEvent.press(await screen.findByText('Administración'));
  fireEvent.press(await screen.findByText('Comentarios y errores'));

  expect(await screen.findByText('Me encanta el escáner')).toBeTruthy();
  fireEvent.press(screen.getByText('Marcar como leído'));
  await waitFor(() =>
    expect(supabase.rpc).toHaveBeenCalledWith('admin_marcar_comentario', {
      p_id: 'c1',
      p_leido: true,
    }),
  );

  fireEvent.press(screen.getByText('Errores (1)'));
  fireEvent.press(await screen.findByText('Pantalla: undefined is not a function'));
  expect(screen.getByText('at Cobrar')).toBeTruthy();
});

it('informarError envía mensaje, versión y negocio, y nunca lanza', async () => {
  useSesion.setState({ negocioId: NEGOCIO });
  await informarError(new Error('Algo falló'), 'Cobrar');
  expect(supabase.rpc).toHaveBeenCalledWith(
    'registrar_error',
    expect.objectContaining({
      p_mensaje: 'Cobrar: Algo falló',
      p_version: '0.1.0 (12)',
      p_negocio_id: NEGOCIO,
    }),
  );

  (supabase.rpc as jest.Mock).mockRejectedValueOnce(new Error('sin internet'));
  await expect(informarError('texto')).resolves.toBeUndefined();
});
