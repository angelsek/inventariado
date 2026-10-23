import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { AJUSTE_DISPOSITIVO, AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import { crearProducto, listarProductos } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
import { registrarVenta } from '@/db/ventas';
import { compartirArchivo } from '@/features/exportar/compartir';
import { MENSAJE_PLAN_PAGADO } from '@/features/suscripcion/planPagado';
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
jest.mock('@/features/exportar/compartir', () => ({
  compartirArchivo: jest.fn(() => Promise.resolve()),
}));
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
  fireEvent.press(await screen.findByLabelText('Vender'));
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
  expect(screen.getByText('Equipos (2 de 2)')).toBeTruthy();
  expect(screen.getByText('Samsung A15 (este equipo)')).toBeTruthy();

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

describe('exportar a Excel es del plan pagado', () => {
  async function abrirExportar() {
    fireEvent.press(screen.getByText('Más'));
    fireEvent.press(await screen.findByText('Exportar datos'));
    // El respaldo completo está siempre: sirve para saber que la pantalla ya cargó.
    await screen.findByText('Descargar respaldo');
  }

  function esperarBloqueo() {
    expect(screen.queryByText('Exportar productos')).toBeNull();
    expect(screen.queryByText('Ventas de este mes')).toBeNull();
    expect(screen.queryByText('Ventas del mes anterior')).toBeNull();
    expect(screen.getByText('Exportar a Excel es del plan pagado')).toBeTruthy();
    expect(screen.getByText('Ver planes')).toBeTruthy();
    expect(screen.getByText('Descargar respaldo')).toBeTruthy();
  }

  it('en prueba: se abre, pero sin los botones de Excel y con el respaldo disponible', async () => {
    await prepararBase({ pruebaDias: 5 });
    await entrar();
    await abrirExportar();
    esperarBloqueo();
  });

  it('en prueba: "Ver planes" lleva a la pantalla de suscripción', async () => {
    respuestasTabla.planes = { data: [], error: null };
    respuestasRpc.mis_dispositivos = { data: { limite: 2, dispositivos: [] }, error: null };
    await prepararBase({ pruebaDias: 5 });
    await entrar();
    await abrirExportar();
    fireEvent.press(screen.getByText('Ver planes'));
    expect(await screen.findByText('Prueba gratis')).toBeTruthy();
  });

  it('pagado: están los botones de Excel y no el candado', async () => {
    await prepararBase({ pagadoDias: 20 });
    await entrar();
    await abrirExportar();
    expect(screen.getByText('Exportar productos')).toBeTruthy();
    expect(screen.getByText('Ventas de este mes')).toBeTruthy();
    expect(screen.getByText('Ventas del mes anterior')).toBeTruthy();
    expect(screen.queryByText('Exportar a Excel es del plan pagado')).toBeNull();
    expect(screen.queryByText('Ver planes')).toBeNull();
  });

  it('pagado: tocar "Exportar productos" comparte de verdad un CSV de productos', async () => {
    (compartirArchivo as jest.Mock).mockClear();
    await prepararBase({ pagadoDias: 20 });
    await entrar();
    await abrirExportar();
    fireEvent.press(screen.getByText('Exportar productos'));
    await waitFor(() => expect(compartirArchivo).toHaveBeenCalledTimes(1));
    const [nombre, tipo, contenido] = (compartirArchivo as jest.Mock).mock.calls[0];
    expect(nombre).toMatch(/^productos-.+\.csv$/);
    expect(tipo).toBe('text/csv');
    expect(contenido).toContain('Cerveza lata');
  });

  it('en prueba: no hay botones que tocar y no se comparte nada', async () => {
    (compartirArchivo as jest.Mock).mockClear();
    await prepararBase({ pruebaDias: 5 });
    await entrar();
    await abrirExportar();
    expect(screen.queryByText('Exportar productos')).toBeNull();
    expect(screen.queryByText('Ventas de este mes')).toBeNull();
    expect(screen.queryByText('Ventas del mes anterior')).toBeNull();
    expect(compartirArchivo).not.toHaveBeenCalled();
  });

  it('vencida en gracia: queda bloqueado igual que en la prueba', async () => {
    await prepararBase({ pagadoDias: -2 });
    await entrar();
    await abrirExportar();
    esperarBloqueo();
  });

  it('suspendida: queda bloqueado, pero el respaldo se puede descargar', async () => {
    await prepararBase({ pagadoDias: -30 });
    await entrar();
    await abrirExportar();
    esperarBloqueo();
  });
});

describe('reportes: exportar a Excel es del plan pagado', () => {
  async function conUnaVenta() {
    const [cerveza] = await listarProductos(mockDb, NEGOCIO);
    await registrarVenta(mockDb, {
      negocioId: NEGOCIO,
      items: [
        {
          clave: cerveza.id,
          productoId: cerveza.id,
          nombre: cerveza.nombre,
          unidad: cerveza.unidad,
          cantidad: 1,
          precioUnitario: cerveza.precioVenta,
          costoUnitario: cerveza.costo,
          descuento: 0,
          stock: cerveza.stock,
        },
      ],
      descuentoGeneral: 0,
      pagos: [{ medio: 'debito', monto: 1290 }],
      efectivoRecibido: null,
      vuelto: null,
      autor: { perfilId: null, dispositivoId: null },
    });
  }

  async function abrirReportes() {
    fireEvent.press(screen.getByText('Más'));
    fireEvent.press(await screen.findByText('Reportes del negocio'));
    await screen.findByText('Hoy');
  }

  it('en prueba: la fila con candado avisa que es del plan pagado', async () => {
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await prepararBase({ pruebaDias: 5 });
    await conUnaVenta();
    await entrar();
    await abrirReportes();

    expect(await screen.findByText('Exportar a Excel es del plan pagado')).toBeTruthy();
    expect(screen.queryByText('Exportar a Excel')).toBeNull();

    fireEvent.press(screen.getByText('Exportar a Excel es del plan pagado'));
    expect(alerta).toHaveBeenCalledWith('Solo con plan pagado', MENSAJE_PLAN_PAGADO);
  });

  it.each([
    ['vencida en gracia', -2],
    ['suspendida', -30],
  ])('%s: la fila con candado reemplaza al botón "Exportar a Excel"', async (_caso, pagadoDias) => {
    await prepararBase({ pagadoDias });
    await conUnaVenta();
    await entrar();
    await abrirReportes();

    expect(await screen.findByText('Exportar a Excel es del plan pagado')).toBeTruthy();
    expect(screen.queryByText('Exportar a Excel')).toBeNull();
  });

  it('pagado: aparece el botón "Exportar a Excel", sin candado', async () => {
    await prepararBase({ pagadoDias: 20 });
    await conUnaVenta();
    await entrar();
    await abrirReportes();

    expect(await screen.findByText('Exportar a Excel')).toBeTruthy();
    expect(screen.queryByText('Exportar a Excel es del plan pagado')).toBeNull();
  });
});

it('importar productos sigue disponible durante la prueba', async () => {
  await prepararBase({ pruebaDias: 5 });
  await entrar();
  fireEvent.press(screen.getByText('Productos'));
  fireEvent.press(await screen.findByText('Importar'));
  expect(await screen.findByText('Elegir archivo CSV')).toBeTruthy();
});
