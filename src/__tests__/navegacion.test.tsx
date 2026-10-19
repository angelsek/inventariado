import { router } from 'expo-router';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { PERMISOS, ROLES_PREDEFINIDOS } from '@/features/permisos/catalogo';
import { reiniciarIntentos } from '@/sesion/intentosPin';
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

// Sin servidor: la sincronización y Supabase no se prueban aquí.
jest.mock('@/lib/supabase', () => require('@/test/mockSupabase'));
jest.mock('@/sync/useSincronizacionAutomatica', () => ({ useSincronizacionAutomatica: () => {} }));

const NEGOCIO = 'negocio-1';

// Roles del negocio: los tres predefinidos (los crea el servidor) y uno propio con solo reportes.
const ROLES: [string, string, string[], string | null][] = [
  ['rol-admin', 'Administrador', [...PERMISOS], 'administrador'],
  ['rol-cajero', 'Cajero', ROLES_PREDEFINIDOS.cajero.permisos, 'cajero'],
  ['rol-bodeguero', 'Bodeguero', ROLES_PREDEFINIDOS.bodeguero.permisos, 'bodeguero'],
  ['rol-analista', 'Analista', ['reportes'], null],
];

async function prepararBase(conNegocio: boolean) {
  mockDb = crearBaseEnMemoria();
  await migrarBaseDeDatos(mockDb);
  if (!conNegocio) return;

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
  for (const [id, nombre, permisos, predefinido] of ROLES) {
    await mockDb.runAsync(
      `INSERT INTO roles (id, negocio_id, nombre, permisos, predefinido, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      NEGOCIO,
      nombre,
      JSON.stringify(permisos),
      predefinido,
      ahora,
      ahora,
    );
  }
}

/** Agrega una persona con su rol y PIN (los roles ya existen en la base). */
const agregarPersona = (nombre: string, rolId: string, pin: string) =>
  crearPerfil(mockDb, { negocioId: NEGOCIO, nombre, rol: 'cajero', rolId, pin });

const marcarPin = (pin: string) => {
  for (const digito of pin) fireEvent.press(screen.getByLabelText(digito));
};

beforeEach(() => {
  reiniciarIntentos();
  useSesion.setState({ cargada: false, negocioId: null, perfil: null, rol: null, versionDatos: 0 });
});

it('sin negocio vinculado muestra la bienvenida', async () => {
  await prepararBase(false);
  renderRouter('src/app');

  expect(await screen.findByText('Crear mi negocio')).toBeTruthy();
  expect(screen.getByText('Ya tengo cuenta')).toBeTruthy();
});

it('con negocio pide elegir usuario y PIN antes de entrar', async () => {
  await prepararBase(true);
  renderRouter('src/app');

  expect(await screen.findByText('¿Quién eres?')).toBeTruthy();
  expect(await screen.findByText('Botillería Ana')).toBeTruthy();

  fireEvent.press(screen.getByText('Carla'));
  expect(await screen.findByText('Hola, Carla')).toBeTruthy();

  marcarPin('0000');
  expect(await screen.findByText('PIN incorrecto')).toBeTruthy();

  marcarPin('5678');
  await waitFor(() => expect(useSesion.getState().perfil?.nombre).toBe('Carla'));
  fireEvent.press(await screen.findByLabelText('Vender'));
  expect(await screen.findByText(/Escanea o busca productos/)).toBeTruthy();
});

it('un cajero no ve la administración de usuarios ni cerrar sesión', async () => {
  await prepararBase(true);
  renderRouter('src/app');

  fireEvent.press(await screen.findByText('Carla'));
  marcarPin('5678');
  fireEvent.press(await screen.findByText('Más'));

  expect(await screen.findByText('Cambiar de usuario')).toBeTruthy();
  expect(screen.queryByText('Usuarios y permisos')).toBeNull();
  expect(screen.queryByText('Cerrar sesión')).toBeNull();
});

it('el dueño puede agregar una persona', async () => {
  await prepararBase(true);
  renderRouter('src/app');

  fireEvent.press(await screen.findByText('Ana'));
  marcarPin('1234');
  fireEvent.press(await screen.findByText('Más'));
  fireEvent.press(await screen.findByText('Usuarios y permisos'));

  fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Pedro');
  fireEvent.changeText(screen.getByLabelText('PIN (4 números)'), '4321');
  fireEvent.press(screen.getByText('Agregar persona'));

  expect(await screen.findByText('Pedro')).toBeTruthy();
  const fila = await mockDb.getFirstAsync<{ pendiente: number }>(
    "SELECT pendiente FROM perfiles WHERE nombre = 'Pedro'",
  );
  expect(fila?.pendiente).toBe(1);
});

let pathname: () => string;
const montar = () => {
  ({ getPathname: pathname } = renderRouter('src/app'));
};

const entrar = async (nombre: string, pin: string) => {
  fireEvent.press(await screen.findByText(nombre));
  marcarPin(pin);
  await waitFor(() => expect(useSesion.getState().perfil?.nombre).toBe(nombre));
};

const irA = async (ruta: '/estadisticas' | '/negocio' | '/exportar' | '/compra' | '/usuarios') => {
  await act(async () => {
    router.push(ruta);
  });
};

describe('permisos en la navegación', () => {
  it('un Bodeguero no ve las pestañas Vender ni Caja, y sí Productos', async () => {
    await prepararBase(true);
    await agregarPersona('Beto', 'rol-bodeguero', '1111');
    montar();

    await entrar('Beto', '1111');

    expect(await screen.findByText('Productos')).toBeTruthy();
    expect(screen.getByText('Más')).toBeTruthy();
    expect(screen.queryByLabelText('Vender')).toBeNull();
    expect(screen.queryByText('Caja')).toBeNull();
    expect(useSesion.getState().rol?.nombre).toBe('Bodeguero');
  });

  it('un Bodeguero no llega a /estadisticas ni a /usuarios escribiendo la ruta', async () => {
    await prepararBase(true);
    await agregarPersona('Beto', 'rol-bodeguero', '1111');
    montar();
    await entrar('Beto', '1111');
    await screen.findByText('Productos');

    await irA('/estadisticas');
    expect(screen.queryByText('Reportes del negocio')).toBeNull();
    expect(pathname()).not.toBe('/estadisticas');

    await irA('/usuarios');
    expect(screen.queryByText('Usuarios y permisos')).toBeNull();
    expect(pathname()).not.toBe('/usuarios');
  });

  it('un Bodeguero sí llega a /compra (tiene mercadería)', async () => {
    await prepararBase(true);
    await agregarPersona('Beto', 'rol-bodeguero', '1111');
    montar();
    await entrar('Beto', '1111');
    await screen.findByText('Productos');

    await irA('/compra');
    expect(pathname()).toBe('/compra');
  });

  it.each(['/estadisticas', '/negocio', '/exportar', '/compra'] as const)(
    'un Cajero que escribe %s no llega a esa pantalla',
    async (ruta) => {
      await prepararBase(true);
      montar();
      await entrar('Carla', '5678');
      await screen.findByLabelText('Vender');

      await irA(ruta);

      expect(pathname()).not.toBe(ruta);
    },
  );

  it('un Cajero ve Vender y Caja', async () => {
    await prepararBase(true);
    montar();
    await entrar('Carla', '5678');

    expect(await screen.findByLabelText('Vender')).toBeTruthy();
    expect(screen.getByText('Caja')).toBeTruthy();
  });

  it('un rol con reportes ve "Reportes del negocio" en Más y puede abrirlos', async () => {
    await prepararBase(true);
    await agregarPersona('Rosa', 'rol-analista', '2222');
    montar();
    await entrar('Rosa', '2222');

    fireEvent.press(await screen.findByText('Más'));
    expect(await screen.findByText('Reportes del negocio')).toBeTruthy();
    expect(screen.queryByText('Datos del negocio')).toBeNull();
    expect(screen.queryByText('Exportar datos')).toBeNull();

    fireEvent.press(screen.getByText('Reportes del negocio'));
    await waitFor(() => expect(pathname()).toBe('/estadisticas'));
  });

  it('un Cajero no ve "Reportes del negocio" en Más', async () => {
    await prepararBase(true);
    montar();
    await entrar('Carla', '5678');

    fireEvent.press(await screen.findByText('Más'));
    expect(await screen.findByText('Cambiar de usuario')).toBeTruthy();
    expect(screen.queryByText('Reportes del negocio')).toBeNull();
  });

  it('una persona con un rol eliminado queda con los permisos del Cajero', async () => {
    await prepararBase(true);
    await agregarPersona('Rosa', 'rol-analista', '2222');
    await mockDb.runAsync("UPDATE roles SET eliminado = 1 WHERE id = 'rol-analista'");
    montar();
    await entrar('Rosa', '2222');

    expect(await screen.findByLabelText('Vender')).toBeTruthy();
    fireEvent.press(screen.getByText('Más'));
    expect(await screen.findByText('Cambiar de usuario')).toBeTruthy();
    expect(screen.queryByText('Reportes del negocio')).toBeNull();
  });

  it('el dueño ve todas las opciones de Más y entra a cualquier pantalla', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');

    expect(await screen.findByLabelText('Vender')).toBeTruthy();
    expect(screen.getByText('Caja')).toBeTruthy();
    fireEvent.press(screen.getByText('Más'));
    for (const texto of [
      'Reportes del negocio',
      'Datos del negocio',
      'Usuarios y permisos',
      'Exportar datos',
      'Cerrar sesión',
      'Eliminar cuenta y datos',
    ]) {
      expect(await screen.findByText(texto)).toBeTruthy();
    }

    await irA('/estadisticas');
    expect(pathname()).toBe('/estadisticas');
  });

  it('se puede asignar un rol al crear una persona', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    fireEvent.press(await screen.findByText('Más'));
    fireEvent.press(await screen.findByText('Usuarios y permisos'));

    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Pedro');
    fireEvent.changeText(screen.getByLabelText('PIN (4 números)'), '4321');
    // El selector de la sección "Nueva persona" es el último de la pantalla.
    const bodegueros = await screen.findAllByText('Bodeguero');
    fireEvent.press(bodegueros[bodegueros.length - 1]);
    fireEvent.press(screen.getByText('Agregar persona'));

    await waitFor(async () => {
      const fila = await mockDb.getFirstAsync<{ rol_id: string; pendiente: number }>(
        "SELECT rol_id, pendiente FROM perfiles WHERE nombre = 'Pedro'",
      );
      expect(fila).toEqual({ rol_id: 'rol-bodeguero', pendiente: 1 });
    });
  });

  it('sin elegir rol, la persona nueva queda como Cajero', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    fireEvent.press(await screen.findByText('Más'));
    fireEvent.press(await screen.findByText('Usuarios y permisos'));

    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Pedro');
    fireEvent.changeText(screen.getByLabelText('PIN (4 números)'), '4321');
    fireEvent.press(screen.getByText('Agregar persona'));

    await waitFor(async () => {
      const fila = await mockDb.getFirstAsync<{ rol_id: string }>(
        "SELECT rol_id FROM perfiles WHERE nombre = 'Pedro'",
      );
      expect(fila?.rol_id).toBe('rol-cajero');
    });
  });

  it('se le puede cambiar el rol a una persona', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    fireEvent.press(await screen.findByText('Más'));
    fireEvent.press(await screen.findByText('Usuarios y permisos'));

    // El primer selector es el de Carla (el dueño no tiene).
    const analistas = await screen.findAllByText('Analista');
    fireEvent.press(analistas[0]);

    await waitFor(async () => {
      const fila = await mockDb.getFirstAsync<{ rol_id: string; pendiente: number }>(
        "SELECT rol_id, pendiente FROM perfiles WHERE nombre = 'Carla'",
      );
      expect(fila?.rol_id).toBe('rol-analista');
      expect(fila?.pendiente).toBeGreaterThan(1);
    });
    // El dueño no cambió.
    const dueno = await mockDb.getFirstAsync<{ rol_id: string | null }>(
      "SELECT rol_id FROM perfiles WHERE nombre = 'Ana'",
    );
    expect(dueno?.rol_id).toBeNull();
  });

  it('quien administra usuarios sin ser dueño no ve "Cambiar PIN" del dueño', async () => {
    await prepararBase(true);
    await agregarPersona('Uma', 'rol-admin', '3333');
    montar();
    await entrar('Uma', '3333');
    fireEvent.press(await screen.findByText('Más'));
    fireEvent.press(await screen.findByText('Usuarios y permisos'));

    await screen.findByText('Carla');
    // Uma y Carla tienen "Cambiar PIN"; Ana (dueña) no.
    expect(screen.getAllByText('Cambiar PIN')).toHaveLength(2);
    // No hay interruptor para activar o desactivar a la dueña ni a sí misma.
    expect(screen.queryByLabelText('Activo: Ana')).toBeNull();
    expect(screen.queryByLabelText('Activo: Uma')).toBeNull();
    expect(screen.getByLabelText('Activo: Carla')).toBeTruthy();
  });

  it('el dueño ve "Cambiar PIN" de todas las personas', async () => {
    await prepararBase(true);
    await agregarPersona('Uma', 'rol-admin', '3333');
    montar();
    await entrar('Ana', '1234');
    fireEvent.press(await screen.findByText('Más'));
    fireEvent.press(await screen.findByText('Usuarios y permisos'));

    await screen.findByText('Carla');
    expect(screen.getAllByText('Cambiar PIN')).toHaveLength(3);
  });

  it('tras 5 PIN incorrectos seguidos bloquea el ingreso, incluso con el PIN correcto', async () => {
    await prepararBase(true);
    montar();

    fireEvent.press(await screen.findByText('Carla'));
    for (let i = 0; i < 4; i++) {
      marcarPin('0000');
      expect(await screen.findByText('PIN incorrecto')).toBeTruthy();
    }
    marcarPin('0000');
    expect(await screen.findByText(/Demasiados intentos/)).toBeTruthy();

    marcarPin('5678');
    await waitFor(() => expect(screen.getByText(/Demasiados intentos/)).toBeTruthy());
    expect(useSesion.getState().perfil).toBeNull();
  });
});
