import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { AJUSTE_NEGOCIO, guardarAjuste, leerAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { useSesion } from '@/sesion/store';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { respuestasRpc, respuestasTabla, supabase } from '@/test/mockSupabase';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

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

// Simula la compilación para Google Play.
let mockCanal: 'play' | 'apk' = 'apk';
jest.mock('@/config', () => ({
  get CANAL() {
    return mockCanal;
  },
  CONTACTO: { whatsapp: '+56912345678', correo: 'pagos@ejemplo.cl', datosTransferencia: 'Banco X' },
}));

const NEGOCIO = 'negocio-1';

beforeEach(async () => {
  useSesion.setState({
    cargada: false,
    negocioId: null,
    perfil: null,
    versionDatos: 0,
    suscripcion: null,
    avisoSalida: null,
  });
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
  await crearPerfil(mockDb, { negocioId: NEGOCIO, nombre: 'Carla', rol: 'cajero', pin: '5678' });
  await guardarAjuste(mockDb, AJUSTE_NEGOCIO, NEGOCIO);
  respuestasTabla.planes = {
    data: [
      {
        id: 'basico',
        nombre: 'Básico',
        precio_mensual: 9990,
        max_dispositivos: 2,
        reportes_avanzados: false,
      },
    ],
    error: null,
  };
});

async function entrarComo(nombre: string, pin: string) {
  renderRouter('src/app');
  fireEvent.press(await screen.findByText(nombre));
  for (const digito of pin) fireEvent.press(screen.getByLabelText(digito));
  fireEvent.press(await screen.findByLabelText('Vender'));
  await screen.findByText(/Escanea o busca productos/);
  fireEvent.press(screen.getByText('Más'));
}

it('el dueño elimina el negocio confirmando con la contraseña', async () => {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { email: 'ana@ejemplo.cl' } } },
  });
  await entrarComo('Ana', '1234');
  fireEvent.press(await screen.findByText('Eliminar cuenta y datos'));

  const boton = await screen.findByText('Eliminar definitivamente');
  fireEvent.changeText(screen.getByLabelText('Escribe ELIMINAR para confirmar'), 'eliminar');
  fireEvent.changeText(screen.getByLabelText('Contraseña de la cuenta'), 'secreta');
  fireEvent.press(boton);

  await waitFor(() =>
    expect(supabase.rpc).toHaveBeenCalledWith('eliminar_mi_negocio', { p_negocio_id: NEGOCIO }),
  );
  expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
    email: 'ana@ejemplo.cl',
    password: 'secreta',
  });
  expect(await screen.findByText('Tu negocio y todos sus datos fueron eliminados.')).toBeTruthy();
  expect(await leerAjuste(mockDb, AJUSTE_NEGOCIO)).toBeNull();
});

it('un cajero no ve la opción de eliminar la cuenta', async () => {
  await entrarComo('Carla', '5678');
  expect(await screen.findByText('Suscripción')).toBeTruthy();
  expect(screen.queryByText('Eliminar cuenta y datos')).toBeNull();
});

it('la versión de Play no muestra precios ni formas de pago externas', async () => {
  mockCanal = 'play';
  await entrarComo('Ana', '1234');
  fireEvent.press(await screen.findByText('Suscripción'));

  expect(await screen.findByText(/se gestiona directamente con Stockeao/)).toBeTruthy();
  expect(screen.queryByText('¿Cómo pagar?')).toBeNull();
  expect(screen.queryByText('Avisar que pagué')).toBeNull();
  expect(screen.queryByText('$9.990/mes')).toBeNull();
  mockCanal = 'apk';
});

it('el APK directo sí muestra cómo pagar', async () => {
  mockCanal = 'apk';
  await entrarComo('Ana', '1234');
  fireEvent.press(await screen.findByText('Suscripción'));
  expect(await screen.findByText('¿Cómo pagar?')).toBeTruthy();
  expect(screen.getByText('Avisar que pagué')).toBeTruthy();
});
