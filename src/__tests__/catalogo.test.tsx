import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { crearCategoria } from '@/db/categorias';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import { crearProducto, listarProductos } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
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

// Cámara falsa: un botón que "lee" el código guardado en mockCodigo.
let mockCodigo = '';
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
          const data = mockCodigo;
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

async function prepararBase() {
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
}

async function entrarComo(nombre: string, pin: string) {
  renderRouter('src/app');
  fireEvent.press(await screen.findByText(nombre));
  for (const digito of pin) fireEvent.press(screen.getByLabelText(digito));
  fireEvent.press(await screen.findByText('Productos'));
}

beforeEach(async () => {
  useSesion.setState({ cargada: false, negocioId: null, perfil: null, versionDatos: 0 });
  await prepararBase();
});

it('el dueño crea un producto con categoría nueva y aparece en el inventario', async () => {
  await entrarComo('Ana', '1234');

  fireEvent.press(await screen.findByText('Agregar producto'));
  fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Cerveza lata 470cc');
  fireEvent.changeText(screen.getByLabelText('Código de barras (opcional)'), '7801234567890');
  fireEvent.press(screen.getByText('+ Nueva categoría'));
  fireEvent.changeText(screen.getByLabelText('Nombre de la categoría'), 'Cervezas');
  fireEvent.press(screen.getByText('Agregar'));
  await screen.findByText('Cervezas');
  fireEvent.changeText(screen.getByLabelText('Precio de venta'), '1290');
  fireEvent.changeText(screen.getByLabelText('Costo'), '800');
  expect(screen.getByText('Ganancia: $490 (38%)')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Stock inicial'), '24');
  fireEvent.press(screen.getByText('Guardar'));

  expect(await screen.findByText('Cerveza lata 470cc')).toBeTruthy();
  expect(screen.getByText('$1.290')).toBeTruthy();
  expect(screen.getByText('Stock: 24')).toBeTruthy();

  const [producto] = await listarProductos(mockDb, NEGOCIO);
  expect(producto).toMatchObject({ categoria: 'Cervezas', costo: 800, stock: 24 });
});

it('no permite dos productos con el mismo código de barras', async () => {
  await crearProducto(
    mockDb,
    NEGOCIO,
    {
      nombre: 'Pisco',
      codigoBarras: '111',
      categoriaId: null,
      precioVenta: 5000,
      costo: 0,
      stockMinimo: 0,
      unidad: 'unidad',
    },
    0,
    AUTOR,
  );
  await entrarComo('Ana', '1234');

  fireEvent.press(await screen.findByText('Nuevo producto'));
  fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Otro');
  fireEvent.changeText(screen.getByLabelText('Código de barras (opcional)'), '111');
  fireEvent.press(screen.getByText('Guardar'));

  expect(await screen.findByText('Ya lo usa "Pisco".')).toBeTruthy();
});

it('escanear un código existente abre ese producto', async () => {
  const categoria = await crearCategoria(mockDb, NEGOCIO, 'Bebidas');
  await crearProducto(
    mockDb,
    NEGOCIO,
    {
      nombre: 'Coca-Cola 1,5L',
      codigoBarras: '7801610001196',
      categoriaId: categoria.id,
      precioVenta: 2200,
      costo: 1500,
      stockMinimo: 0,
      unidad: 'unidad',
    },
    10,
    AUTOR,
  );
  await entrarComo('Ana', '1234');

  mockCodigo = '7801610001196';
  fireEvent.press(await screen.findByLabelText('Escanear código'));
  fireEvent.press(await screen.findByText('Simular lectura'));
  expect(await screen.findByDisplayValue('Coca-Cola 1,5L')).toBeTruthy();
  expect(screen.getByText('Stock actual')).toBeTruthy();
});

it('un código desconocido lleva al formulario de producto nuevo con el código listo', async () => {
  await entrarComo('Ana', '1234');

  mockCodigo = '999000111';
  fireEvent.press(await screen.findByLabelText('Escanear código'));
  fireEvent.press(await screen.findByText('Simular lectura'));

  await waitFor(() => expect(screen.getByDisplayValue('999000111')).toBeTruthy());
  expect(screen.getAllByText('Nuevo producto').length).toBeGreaterThan(0);
});

it('el cajero ve el producto sin costo y sin poder editar ni crear', async () => {
  await crearProducto(
    mockDb,
    NEGOCIO,
    {
      nombre: 'Pisco 35°',
      codigoBarras: null,
      categoriaId: null,
      precioVenta: 6990,
      costo: 4500,
      stockMinimo: 0,
      unidad: 'unidad',
    },
    3,
    AUTOR,
  );
  await entrarComo('Carla', '5678');

  expect(screen.queryByText('Nuevo producto')).toBeNull();
  expect(screen.queryByText('Importar')).toBeNull();
  fireEvent.press(await screen.findByText('Pisco 35°'));

  expect(await screen.findByText('$6.990')).toBeTruthy();
  expect(screen.queryByText(/4\.500/)).toBeNull();
  expect(screen.queryByText('Guardar')).toBeNull();
});

it('el dueño crea un six-pack con promoción y envase', async () => {
  const idLata = await crearProducto(
    mockDb,
    NEGOCIO,
    {
      nombre: 'Cerveza lata',
      codigoBarras: null,
      categoriaId: null,
      precioVenta: 1000,
      costo: 600,
      stockMinimo: 0,
      unidad: 'unidad',
    },
    30,
    AUTOR,
  );
  await entrarComo('Ana', '1234');

  fireEvent.press(await screen.findByText('Nuevo producto'));
  fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Six pack');
  fireEvent.changeText(screen.getByLabelText('Precio de venta'), '5500');
  fireEvent.press(screen.getByText('Elegir el producto que contiene'));
  const buscadores = await screen.findAllByLabelText('Buscar producto');
  fireEvent.changeText(buscadores[buscadores.length - 1], 'lata');
  const resultados = await screen.findAllByText('Cerveza lata');
  fireEvent.press(resultados[resultados.length - 1]);
  fireEvent.changeText(await screen.findByLabelText('Unidades del pack'), '6');
  fireEvent.changeText(screen.getByLabelText('Llevando'), '2');
  fireEvent.changeText(screen.getByLabelText('Pagan'), '10000');
  expect(screen.getByText('Promo: 2 x $10.000')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Envase retornable (opcional)'), '0');
  fireEvent.press(screen.getByText('Guardar'));

  expect(await screen.findByText('Six pack')).toBeTruthy();
  const six = (await listarProductos(mockDb, NEGOCIO)).find((p) => p.nombre === 'Six pack');
  expect(six).toMatchObject({
    packProductoId: idLata,
    packCantidad: 6,
    promoCantidad: 2,
    promoPrecio: 10000,
    precioEnvase: 0,
    stock: 5,
  });
});
