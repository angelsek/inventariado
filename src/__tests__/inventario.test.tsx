import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert, Share } from 'react-native';

import { AJUSTE_DISPOSITIVO, AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { listarCajasCerradas } from '@/db/cajas';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import { crearProducto, obtenerProducto } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
import { useConteo } from '@/features/inventario/conteo';
import { useCarrito } from '@/features/ventas/carrito';
import { useSesion } from '@/sesion/store';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

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

let mockCodigos: string[] = [];
jest.mock('expo-camera', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned: (r: { data: string }) => void }) => (
      <Pressable onPress={() => onBarcodeScanned({ data: mockCodigos.shift() ?? '' })}>
        <Text>Simular lectura</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/lib/supabase', () => ({
  supabaseConfigurado: true,
  supabase: {},
  mensajeDeError: (e: unknown) => String(e),
}));
jest.mock('@/sync/useSincronizacionAutomatica', () => ({ useSincronizacionAutomatica: () => {} }));
jest.mock('@/sync/ejecutar', () => ({ sincronizarAhora: jest.fn() }));

const NEGOCIO = 'negocio-1';
const AUTOR = { perfilId: null, dispositivoId: 'disp-1' };
let cervezaId: string;

beforeEach(async () => {
  useSesion.setState({ cargada: false, negocioId: null, perfil: null, versionDatos: 0 });
  useCarrito.getState().vaciar();
  useConteo.getState().vaciar();
  jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
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
  await guardarAjuste(mockDb, AJUSTE_DISPOSITIVO, 'disp-1');
  cervezaId = await crearProducto(
    mockDb,
    NEGOCIO,
    {
      nombre: 'Cerveza lata',
      codigoBarras: '780111',
      categoriaId: null,
      precioVenta: 1290,
      costo: 800,
      stockMinimo: 12,
      unidad: 'unidad',
    },
    10,
    AUTOR,
  );
});

afterEach(() => jest.restoreAllMocks());

async function entrar() {
  renderRouter('src/app');
  fireEvent.press(await screen.findByText('Ana'));
  for (const digito of '1234') fireEvent.press(screen.getByLabelText(digito));
  await screen.findByText(/Escanea o busca productos/);
}

it('abrir caja, vender en efectivo, retirar y cerrar con diferencia', async () => {
  await entrar();
  expect(await screen.findByText('Caja cerrada: toca aquí para abrirla.')).toBeTruthy();

  fireEvent.press(screen.getByText('Caja'));
  fireEvent.changeText(await screen.findByLabelText('Efectivo al abrir (sencillo)'), '10000');
  fireEvent.press(screen.getByText('Abrir caja'));
  expect(await screen.findByText('Caja abierta')).toBeTruthy();

  // Vender 2 cervezas en efectivo.
  fireEvent.press(screen.getByText('Vender'));
  fireEvent.changeText(await screen.findByLabelText('Buscar producto para vender'), 'cerveza');
  fireEvent.press(await screen.findByText('Cerveza lata'));
  fireEvent.press(await screen.findByLabelText('Agregar uno de Cerveza lata'));
  fireEvent.press(screen.getByText('Cobrar $2.580'));
  fireEvent.press(await screen.findByText('Confirmar venta $2.580'));
  fireEvent.press(await screen.findByText('Nueva venta'));

  fireEvent.press(await screen.findByText('Caja'));
  expect(await screen.findByText('$12.580')).toBeTruthy(); // efectivo en caja

  fireEvent.press(screen.getByText('Retiro'));
  fireEvent.changeText(await screen.findByLabelText('Monto'), '2000');
  fireEvent.changeText(screen.getByLabelText('Motivo'), 'Hielo');
  fireEvent.press(screen.getByText('Guardar'));
  expect(await screen.findByText('$10.580')).toBeTruthy();

  fireEvent.press(screen.getByText('Cerrar caja'));
  fireEvent.changeText(await screen.findByLabelText('Efectivo contado'), '10500');
  expect(await screen.findByText('Falta')).toBeTruthy();
  fireEvent.press(screen.getByText('Confirmar cierre'));

  expect(await screen.findByText('Cierres anteriores')).toBeTruthy();
  const [cierre] = await listarCajasCerradas(mockDb, NEGOCIO);
  expect(cierre).toMatchObject({ efectivoEsperado: 10580, montoContado: 10500 });
  await waitFor(() => expect(Share.share).toHaveBeenCalled());
});

it('ingreso de mercadería con proveedor nuevo suma stock y actualiza costo', async () => {
  await entrar();
  fireEvent.press(screen.getByText('Inventario'));
  fireEvent.press(await screen.findByText('Ingreso'));

  fireEvent.press(await screen.findByText('+ Nuevo proveedor'));
  fireEvent.changeText(screen.getByLabelText('Nombre del proveedor'), 'Distribuidora Sur');
  fireEvent.press(screen.getByText('Agregar'));
  await screen.findByText('Distribuidora Sur');

  mockCodigos = ['780111'];
  fireEvent.press(screen.getByLabelText('Escanear producto'));
  fireEvent.press(await screen.findByText('Simular lectura'));
  fireEvent.press(await screen.findByText('Listo'));

  fireEvent.changeText(await screen.findByLabelText('Cantidad de Cerveza lata'), '24');
  fireEvent.changeText(screen.getByLabelText('Costo de Cerveza lata'), '850');
  fireEvent.press(screen.getByText('Guardar ingreso $20.400'));

  await waitFor(async () =>
    expect(await obtenerProducto(mockDb, cervezaId)).toMatchObject({ stock: 34, costo: 850 }),
  );
});

it('ajuste de stock con motivo aparece en el historial del producto', async () => {
  await entrar();
  fireEvent.press(screen.getByText('Inventario'));
  fireEvent.press(await screen.findByText('Cerveza lata'));
  fireEvent.press(await screen.findByText('Ajustar stock'));
  fireEvent.changeText(await screen.findByLabelText('¿Cuánto hay realmente?'), '7');
  expect(screen.getByText('Resta 3')).toBeTruthy();
  fireEvent.press(screen.getByText('Rotura'));
  fireEvent.press(screen.getByText('Guardar ajuste'));

  expect(await screen.findByText('Ajuste · Rotura')).toBeTruthy();
  expect(screen.getByText('-3')).toBeTruthy();
  expect((await obtenerProducto(mockDb, cervezaId))?.stock).toBe(7);
});

it('conteo: escanear suma unidades y al aplicar el stock queda igual a lo contado', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, botones) => {
    botones?.find((b) => b.text === 'Aplicar')?.onPress?.();
  });
  await entrar();
  fireEvent.press(screen.getByText('Inventario'));
  fireEvent.press(await screen.findByText('Conteo'));

  mockCodigos = ['780111', '780111'];
  fireEvent.press(await screen.findByLabelText('Escanear producto'));
  fireEvent.press(await screen.findByText('Simular lectura'));
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
  fireEvent.press(screen.getByText('Simular lectura'));
  fireEvent.press(screen.getByText('Listo'));

  expect(await screen.findByDisplayValue('2')).toBeTruthy();
  expect(screen.getByText(/-8/)).toBeTruthy();
  fireEvent.press(screen.getByText('Aplicar conteo (1)'));

  expect(await screen.findByText(/1 producto\(s\) ajustado\(s\)/)).toBeTruthy();
  expect((await obtenerProducto(mockDb, cervezaId))?.stock).toBe(2);
});

it('reponer lista los productos bajo el mínimo', async () => {
  await entrar();
  fireEvent.press(screen.getByText('Inventario'));
  fireEvent.press(await screen.findByText('Reponer'));
  expect(await screen.findByText('Quedan 10')).toBeTruthy();
  expect(screen.getByText('Mínimo 12')).toBeTruthy();
  fireEvent.press(screen.getByText('Compartir lista'));
  await waitFor(() =>
    expect(Share.share).toHaveBeenCalledWith({
      message: expect.stringContaining('Cerveza lata: quedan 10'),
    }),
  );
});
