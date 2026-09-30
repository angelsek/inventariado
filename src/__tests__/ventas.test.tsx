import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Share } from 'react-native';

import { AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import { crearProducto, obtenerProducto } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
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

// Cámara falsa: cada toque "lee" el siguiente código de mockCodigos.
let mockCodigos: string[] = [];
jest.mock('expo-camera', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
    CameraView: ({
      onBarcodeScanned,
    }: {
      onBarcodeScanned: (r: { type: string; data: string }) => void;
    }) => (
      <Pressable
        onPress={() => {
          // El escáner pide varias lecturas iguales seguidas antes de aceptar un código.
          const data = mockCodigos.shift() ?? '';
          for (let i = 0; i < 3; i++) onBarcodeScanned({ type: 'code128', data });
        }}
      >
        <Text>Simular lectura</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/lib/supabase', () => require('@/test/mockSupabase'));
jest.mock('@/sync/useSincronizacionAutomatica', () => ({ useSincronizacionAutomatica: () => {} }));
jest.mock('@/sync/ejecutar', () => ({ sincronizarAhora: jest.fn() }));

const NEGOCIO = 'negocio-1';
const AUTOR = { perfilId: null, dispositivoId: null };
let cervezaId: string;
let quesoId: string;

beforeEach(async () => {
  useSesion.setState({ cargada: false, negocioId: null, perfil: null, versionDatos: 0 });
  useCarrito.getState().vaciar();
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
  const base = { categoriaId: null, costo: 0, stockMinimo: 0 };
  cervezaId = await crearProducto(
    mockDb,
    NEGOCIO,
    {
      ...base,
      nombre: 'Cerveza lata',
      codigoBarras: '780111',
      precioVenta: 1290,
      unidad: 'unidad',
    },
    24,
    AUTOR,
  );
  quesoId = await crearProducto(
    mockDb,
    NEGOCIO,
    { ...base, nombre: 'Queso gauda', codigoBarras: '780222', precioVenta: 9990, unidad: 'kg' },
    3,
    AUTOR,
  );
});

async function entrarComo(nombre: string, pin: string) {
  renderRouter('src/app');
  fireEvent.press(await screen.findByText(nombre));
  for (const digito of pin) fireEvent.press(screen.getByLabelText(digito));
  await screen.findByText(/Escanea o busca productos/);
}

it('vende escaneando, cobra en efectivo con vuelto y descuenta stock', async () => {
  await entrarComo('Carla', '5678');

  // Cada escaneo agrega el producto y vuelve a Vender; dos escaneos suman 2 unidades.
  for (const cantidad of [1, 2]) {
    // El escáner ignora el mismo código por un momento: se simula el paso del tiempo.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + cantidad * 5000);
    mockCodigos = ['780111'];
    fireEvent.press(screen.getByLabelText('Escanear para vender'));
    fireEvent.press(await screen.findByText('Simular lectura'));
    await waitFor(() => expect(useCarrito.getState().items[0]?.cantidad).toBe(cantidad));
    expect(screen.queryByLabelText('Cerrar escáner')).toBeNull();
    jest.restoreAllMocks();
  }

  expect(await screen.findByText('$2.580')).toBeTruthy();

  // Queso por peso: busca, elige 0,5 kg.
  fireEvent.changeText(screen.getByLabelText('Buscar producto para vender'), 'queso');
  fireEvent.press(await screen.findByText('Queso gauda'));
  fireEvent.press(await screen.findByText('0,5 kg'));

  fireEvent.press(await screen.findByText('Cobrar $7.575'));
  fireEvent.press(await screen.findByText('$10.000'));
  expect(await screen.findByText('$2.425')).toBeTruthy(); // vuelto

  fireEvent.press(screen.getByText('Confirmar venta $7.575'));
  expect(await screen.findByText('Venta registrada')).toBeTruthy();
  expect(screen.getByText('Vuelto: $2.425')).toBeTruthy();

  expect((await obtenerProducto(mockDb, cervezaId))?.stock).toBe(22);
  expect((await obtenerProducto(mockDb, quesoId))?.stock).toBe(2.5);
  expect(useCarrito.getState().items).toEqual([]);

  // El cajero no puede anular.
  expect(screen.queryByText('Anular venta')).toBeNull();

  const compartir = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  fireEvent.press(screen.getByText('Compartir comprobante'));
  await waitFor(() => expect(compartir).toHaveBeenCalled());
  expect(compartir.mock.calls[0][0]).toMatchObject({
    message: expect.stringContaining('TOTAL: $7.575'),
  });
});

it('un código que no está en el catálogo avisa sin agregar nada', async () => {
  await entrarComo('Carla', '5678');

  mockCodigos = ['00000'];
  fireEvent.press(screen.getByLabelText('Escanear para vender'));
  fireEvent.press(await screen.findByText('Simular lectura'));
  expect(await screen.findByText('Código 00000 no está en el catálogo')).toBeTruthy();
  fireEvent.press(screen.getByText('Listo'));

  expect(await screen.findByText('El código 00000 no está en el catálogo.')).toBeTruthy();
  expect(useCarrito.getState().items).toEqual([]);
});

it('pago mixto con débito y monto libre; el dueño anula y el stock vuelve', async () => {
  await entrarComo('Ana', '1234');

  fireEvent.changeText(screen.getByLabelText('Buscar producto para vender'), 'cerveza');
  fireEvent.press(await screen.findByText('Cerveza lata'));
  fireEvent.press(await screen.findByText('+ Monto libre'));
  fireEvent.changeText(await screen.findByLabelText('Monto'), '710');
  fireEvent.changeText(screen.getByLabelText('Detalle (opcional)'), 'Hielo');
  fireEvent.press(screen.getByText('Agregar'));

  fireEvent.press(await screen.findByText('Cobrar $2.000'));
  fireEvent.press(await screen.findByText('+ Pago mixto (ej. parte débito y parte efectivo)'));
  fireEvent.changeText(await screen.findByLabelText('Monto con Débito'), '1500');
  fireEvent.press(screen.getByText('Exacto'));
  fireEvent.press(screen.getByText('Confirmar venta $2.000'));
  await screen.findByText('Venta registrada');

  expect((await obtenerProducto(mockDb, cervezaId))?.stock).toBe(23);

  fireEvent.press(screen.getByText('Anular venta'));
  fireEvent.changeText(await screen.findByLabelText('Motivo (opcional)'), 'Prueba');
  fireEvent.press(screen.getByText('Confirmar anulación'));
  expect(await screen.findByText('Venta anulada')).toBeTruthy();
  expect(screen.getByText('Motivo: Prueba')).toBeTruthy();
  expect((await obtenerProducto(mockDb, cervezaId))?.stock).toBe(24);

  const pagos = await mockDb.getAllAsync<{ medio: string; monto: number }>(
    'SELECT medio, monto FROM pagos ORDER BY medio',
  );
  expect(pagos).toEqual([
    { medio: 'debito', monto: 1500 },
    { medio: 'efectivo', monto: 500 },
  ]);

  // Historial del día: aparece anulada y no suma.
  await act(async () => {
    fireEvent.press(screen.getByText('Nueva venta'));
  });
  fireEvent.press(await screen.findByText('Ventas del día'));
  expect(await screen.findByText('Anulada')).toBeTruthy();
  expect(screen.getByText('0 venta(s)')).toBeTruthy();
});
