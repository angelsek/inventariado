import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { AJUSTE_NEGOCIO, guardarAjuste, leerAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { useSesion } from '@/sesion/store';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import * as iap from '@/test/mockExpoIap';
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

// Productos de suscripción como los entrega Google Play (con la oferta de 14 días gratis).
const productoPlay = (id: string, precio: string) => ({
  id,
  displayPrice: precio,
  subscriptionOffers: [
    {
      offerTokenAndroid: `oferta-${id}`,
      pricingPhasesAndroid: {
        pricingPhaseList: [
          { priceAmountMicros: '0', formattedPrice: 'Gratis', billingPeriod: 'P14D' },
          { priceAmountMicros: '9990000000', formattedPrice: precio, billingPeriod: 'P1M' },
        ],
      },
    },
  ],
});

async function prepararPlay(pruebaHasta: string | null, pagadoHasta: string | null) {
  mockCanal = 'play';
  const ahora = new Date().toISOString();
  await mockDb.runAsync(
    `INSERT INTO suscripciones (id, negocio_id, plan_id, prueba_hasta, pagado_hasta, creado_en, actualizado_en)
     VALUES (?, ?, 'pro', ?, ?, ?, ?)`,
    NEGOCIO,
    NEGOCIO,
    pruebaHasta,
    pagadoHasta,
    ahora,
    ahora,
  );
  (iap.fetchProducts as jest.Mock).mockResolvedValue([
    productoPlay('stockeao_basico', '$9.990'),
    productoPlay('stockeao_pro', '$14.990'),
  ]);
}

afterEach(() => {
  mockCanal = 'apk';
});

it('Play: un negocio sin plan elige uno y se suscribe con Google (14 días gratis)', async () => {
  const enUnMes = new Date(Date.now() + 30 * 86400000).toISOString();
  await prepararPlay(enUnMes, null);
  renderRouter('src/app');
  fireEvent.press(await screen.findByText('Ana'));
  for (const digito of '1234') fireEvent.press(screen.getByLabelText(digito));

  expect(await screen.findByText('Elige tu plan')).toBeTruthy();
  expect(await screen.findByText('$9.990/mes')).toBeTruthy();
  expect(screen.getByText('$14.990/mes')).toBeTruthy();
  // Sin transferencias ni formas de pago externas (política de Play).
  expect(screen.queryByText('¿Cómo pagar?')).toBeNull();

  fireEvent.press(screen.getAllByText('Probar 14 días gratis')[1]);
  await waitFor(() =>
    expect(iap.requestPurchase).toHaveBeenCalledWith({
      type: 'subs',
      request: {
        google: {
          skus: ['stockeao_pro'],
          subscriptionOffers: [{ sku: 'stockeao_pro', offerToken: 'oferta-stockeao_pro' }],
          obfuscatedAccountId: NEGOCIO,
        },
      },
    }),
  );

  // Google aprueba la compra: se verifica en el servidor y se cierra la transacción.
  const compra = {
    purchaseState: 'purchased',
    purchaseToken: 'token-1',
    productId: 'stockeao_pro',
  };
  iap.oyentes.compras.forEach((fn) => fn(compra));
  expect(await screen.findByText('¡Listo! Tu plan quedó activo.')).toBeTruthy();
  expect(supabase.functions.invoke).toHaveBeenCalledWith('verificar-compra-play', {
    body: { purchaseToken: 'token-1', negocioId: NEGOCIO },
  });
  expect(iap.finishTransaction).toHaveBeenCalledWith({ purchase: compra, isConsumable: false });
});

it('Play: un cajero de un negocio sin plan no puede comprar', async () => {
  await prepararPlay(new Date(Date.now() + 86400000).toISOString(), null);
  renderRouter('src/app');
  fireEvent.press(await screen.findByText('Carla'));
  for (const digito of '5678') fireEvent.press(screen.getByLabelText(digito));
  expect(await screen.findByText(/Pídele al dueño del negocio que active un plan/)).toBeTruthy();
  expect(screen.queryByText('Probar 14 días gratis')).toBeNull();
});

it('Play: con el plan pagado se usa la app normal y se administra en Google Play', async () => {
  await prepararPlay(null, new Date(Date.now() + 20 * 86400000).toISOString());
  await entrarComo('Ana', '1234');
  fireEvent.press(await screen.findByText('Suscripción'));
  expect(await screen.findByText('Activa')).toBeTruthy();
  fireEvent.press(await screen.findByText('Cambiar tarjeta o cancelar (Google Play)'));
  await waitFor(() =>
    expect(iap.deepLinkToSubscriptions).toHaveBeenCalledWith({
      skuAndroid: 'stockeao_basico',
      packageNameAndroid: 'cl.stockeao.app',
    }),
  );
});
