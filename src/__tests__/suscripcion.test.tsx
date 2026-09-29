import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { AJUSTE_DISPOSITIVO, AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import { crearProducto } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
import { useCarrito } from '@/features/ventas/carrito';
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

const NEGOCIO = 'negocio-1';
const DIA = 86400000;

async function prepararBase(suscripcion: {
  pruebaDias?: number;
  pagadoDias?: number;
  suspendida?: boolean;
}) {
  mockDb = crearBaseEnMemoria();
  await migrarBaseDeDatos(mockDb);
  const ahora = new Date().toISOString();
  const fecha = (dias?: number) =>
    dias === undefined ? null : new Date(Date.now() + dias * DIA).toISOString();
  await mockDb.runAsync(
    'INSERT INTO negocios (id, nombre, creado_en, actualizado_en) VALUES (?, ?, ?, ?)',
    NEGOCIO,
    'Botillería Ana',
    ahora,
    ahora,
  );
  await mockDb.runAsync(
    `INSERT INTO suscripciones (id, negocio_id, plan_id, prueba_hasta, pagado_hasta, suspendida, creado_en, actualizado_en)
     VALUES (?, ?, 'basico', ?, ?, ?, ?, ?)`,
    NEGOCIO,
    NEGOCIO,
    fecha(suscripcion.pruebaDias),
    fecha(suscripcion.pagadoDias),
    suscripcion.suspendida ? 1 : 0,
    ahora,
    ahora,
  );
  await crearPerfil(mockDb, { negocioId: NEGOCIO, nombre: 'Ana', rol: 'dueno', pin: '1234' });
  await guardarAjuste(mockDb, AJUSTE_NEGOCIO, NEGOCIO);
  await guardarAjuste(mockDb, AJUSTE_DISPOSITIVO, 'disp-1');
  await crearProducto(
    mockDb,
    NEGOCIO,
    {
      nombre: 'Cerveza lata',
      codigoBarras: null,
      categoriaId: null,
      precioVenta: 1290,
      costo: 800,
      stockMinimo: 0,
      unidad: 'unidad',
    },
    10,
    { perfilId: null, dispositivoId: null },
  );
}

async function entrar() {
  renderRouter('src/app');
  fireEvent.press(await screen.findByText('Ana'));
  for (const digito of '1234') fireEvent.press(screen.getByLabelText(digito));
  await screen.findByText(/Escanea o busca productos/);
}

beforeEach(() => {
  useSesion.setState({
    cargada: false,
    negocioId: null,
    perfil: null,
    versionDatos: 0,
    suscripcion: null,
  });
  useCarrito.getState().vaciar();
  for (const k of Object.keys(respuestasRpc)) delete respuestasRpc[k];
  for (const k of Object.keys(respuestasTabla)) delete respuestasTabla[k];
  jest.clearAllMocks();
});

afterEach(() => jest.restoreAllMocks());

it('suspendida: muestra el aviso y no deja registrar ventas', async () => {
  const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await prepararBase({ pagadoDias: -30 });
  await entrar();

  expect(screen.getByText(/Suscripción suspendida/)).toBeTruthy();

  fireEvent.changeText(screen.getByLabelText('Buscar producto para vender'), 'cerveza');
  fireEvent.press(await screen.findByText('Cerveza lata'));
  fireEvent.press(await screen.findByText('Cobrar $1.290'));
  fireEvent.press(await screen.findByText('Confirmar venta $1.290'));

  await waitFor(() => expect(alerta).toHaveBeenCalledWith('Solo lectura', expect.any(String)));
  const ventas = await mockDb.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM ventas');
  expect(ventas?.n).toBe(0);
});

it('prueba por terminar: aviso leve; vencida: aviso con días de gracia', async () => {
  await prepararBase({ pruebaDias: 2 });
  await entrar();
  expect(screen.getByText('Tu prueba gratis termina en 2 días.')).toBeTruthy();
});

it('vencida muestra los días de gracia pero deja vender', async () => {
  await prepararBase({ pagadoDias: -2 });
  await entrar();
  expect(screen.getByText(/Te quedan 5 días antes de pasar a solo lectura/)).toBeTruthy();
});

it('la pantalla de suscripción muestra planes y teléfonos, y permite desvincular otro teléfono', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, botones) => {
    botones?.find((b) => b.text === 'Desvincular')?.onPress?.();
  });
  respuestasTabla.planes = {
    data: [
      {
        id: 'basico',
        nombre: 'Básico',
        precio_mensual: 9990,
        max_dispositivos: 2,
        reportes_avanzados: false,
      },
      {
        id: 'pro',
        nombre: 'Pro',
        precio_mensual: 19990,
        max_dispositivos: 5,
        reportes_avanzados: true,
      },
    ],
    error: null,
  };
  respuestasRpc.mis_dispositivos = {
    data: {
      limite: 2,
      dispositivos: [
        { id: 'disp-1', nombre: 'Samsung A15', ultimo_sync: null },
        { id: 'disp-2', nombre: 'Motorola G', ultimo_sync: null },
      ],
    },
    error: null,
  };
  await prepararBase({ pagadoDias: 20 });
  await entrar();

  fireEvent.press(screen.getByText('Más'));
  fireEvent.press(await screen.findByText('Suscripción'));

  expect(await screen.findByText('Activa')).toBeTruthy();
  expect(await screen.findByText('$9.990/mes')).toBeTruthy();
  expect(screen.getByText('Teléfonos (2 de 2)')).toBeTruthy();
  expect(screen.getByText('Samsung A15 (este teléfono)')).toBeTruthy();

  // Solo se puede desvincular el otro teléfono.
  expect(screen.getAllByText('Desvincular')).toHaveLength(1);
  fireEvent.press(screen.getByText('Desvincular'));
  await waitFor(() =>
    expect(supabase.rpc).toHaveBeenCalledWith('desvincular_dispositivo', { p_id: 'disp-2' }),
  );
});

it('el panel de administración solo aparece para administradores y registra pagos', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  respuestasRpc.es_admin = { data: true, error: null };
  respuestasTabla.planes = {
    data: [
      { id: 'basico', nombre: 'Básico', precio_mensual: 9990 },
      { id: 'pro', nombre: 'Pro', precio_mensual: 19990 },
    ],
    error: null,
  };
  respuestasRpc.admin_listar_negocios = {
    data: [
      {
        id: 'n-cliente',
        nombre: 'Minimarket Dani',
        rut: null,
        correo: 'dani@ejemplo.cl',
        creado_en: new Date().toISOString(),
        plan_id: 'pro',
        estado: 'prueba',
        prueba_hasta: new Date(Date.now() + 5 * DIA).toISOString(),
        pagado_hasta: null,
        suspendida: false,
        notas: null,
        dispositivos: 2,
        ultimo_sync: null,
      },
    ],
    error: null,
  };
  await prepararBase({ pagadoDias: 20 });
  await entrar();

  fireEvent.press(screen.getByText('Más'));
  fireEvent.press(await screen.findByText('Administración'));
  fireEvent.press(await screen.findByText('Minimarket Dani'));

  fireEvent.press(await screen.findByText('Básico $9.990'));
  fireEvent.press(screen.getByText('3 meses'));
  fireEvent.press(screen.getByText('Registrar pago $29.970'));

  await waitFor(() =>
    expect(supabase.rpc).toHaveBeenCalledWith('admin_registrar_pago', {
      p_negocio_id: 'n-cliente',
      p_plan_id: 'basico',
      p_meses: 3,
      p_monto: 29970,
      p_medio: 'Transferencia',
      p_notas: null,
    }),
  );
});

it('sin permisos de administrador no aparece el panel', async () => {
  respuestasRpc.es_admin = { data: false, error: null };
  await prepararBase({ pagadoDias: 20 });
  await entrar();
  fireEvent.press(screen.getByText('Más'));
  expect(await screen.findByText('Suscripción')).toBeTruthy();
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('es_admin'));
  expect(screen.queryByText('Administración')).toBeNull();
});
