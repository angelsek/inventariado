import { router } from 'expo-router';
import { Alert } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { AJUSTE_NEGOCIO, guardarAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { type Permiso, PERMISOS_INICIALES } from '@/features/permisos/catalogo';
import { reiniciarIntentos } from '@/sesion/intentosPin';
import { useSesion } from '@/sesion/store';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { PERMISOS_CAJERO } from '@/test/personas';

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

// Permisos de las personas de prueba (cada una tiene los suyos, no hay roles).
const PERMISOS_BODEGUERO: Permiso[] = ['productos_editar', 'mercaderia', 'stock'];

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
  await crearPerfil(mockDb, {
    negocioId: NEGOCIO,
    nombre: 'Carla',
    rol: 'cajero',
    pin: '5678',
    permisos: PERMISOS_CAJERO,
  });
  await guardarAjuste(mockDb, AJUSTE_NEGOCIO, NEGOCIO);
}

/** Agrega una persona con sus permisos (sin `permisos` parte con los iniciales) y su PIN. */
const agregarPersona = (nombre: string, pin: string, permisos?: readonly Permiso[]) =>
  crearPerfil(mockDb, { negocioId: NEGOCIO, nombre, rol: 'cajero', pin, permisos });

const marcarPin = (pin: string) => {
  for (const digito of pin) fireEvent.press(screen.getByLabelText(digito));
};

const filaDe = (nombre: string) =>
  mockDb.getFirstAsync<{ permisos: string; nombre: string; activo: number; pendiente: number }>(
    'SELECT nombre, permisos, activo, pendiente FROM perfiles WHERE nombre = ?',
    nombre,
  );
const permisosGuardados = async (nombre: string): Promise<string[]> =>
  JSON.parse((await filaDe(nombre))!.permisos);

beforeEach(() => {
  reiniciarIntentos();
  useSesion.setState({ cargada: false, negocioId: null, perfil: null, versionDatos: 0 });
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
  fireEvent.press(await screen.findByText('Nueva persona'));

  fireEvent.changeText(await screen.findByLabelText('Nombre'), 'Pedro');
  fireEvent.changeText(screen.getByLabelText('PIN (4 números)'), '4321');
  fireEvent.press(screen.getByText('Agregar persona'));

  expect(await screen.findByText('Pedro')).toBeTruthy();
  const fila = await filaDe('Pedro');
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

const irA = async (
  ruta: '/estadisticas' | '/negocio' | '/exportar' | '/compra' | '/usuarios' | '/usuario/nuevo',
) => {
  await act(async () => {
    router.push(ruta);
  });
};

describe('permisos en la navegación', () => {
  it('quien solo tiene inventario no ve las pestañas Vender ni Caja, y sí Productos', async () => {
    await prepararBase(true);
    await agregarPersona('Beto', '1111', PERMISOS_BODEGUERO);
    montar();

    await entrar('Beto', '1111');

    expect(await screen.findByText('Productos')).toBeTruthy();
    expect(screen.getByText('Más')).toBeTruthy();
    expect(screen.queryByLabelText('Vender')).toBeNull();
    expect(screen.queryByText('Caja')).toBeNull();
    expect(useSesion.getState().perfil?.permisos).toEqual(PERMISOS_BODEGUERO);
  });

  it('quien no tiene "vender" no ve Vender aunque tenga los demás permisos iniciales', async () => {
    await prepararBase(true);
    await agregarPersona(
      'Vera',
      '2222',
      PERMISOS_INICIALES.filter((p) => p !== 'vender'),
    );
    montar();

    await entrar('Vera', '2222');

    expect(await screen.findByText('Caja')).toBeTruthy();
    expect(screen.queryByLabelText('Vender')).toBeNull();
  });

  it('un cajero que también hace inventario ve Vender y las acciones de Productos', async () => {
    await prepararBase(true);
    // Sin lista de permisos: parte con los 7 iniciales (vender, ver ventas, caja, fiado,
    // editar productos, mercadería y conteo de stock).
    await agregarPersona('Cira', '3333');
    montar();

    await entrar('Cira', '3333');

    expect(await screen.findByLabelText('Vender')).toBeTruthy();
    expect(screen.getByText('Caja')).toBeTruthy();
    fireEvent.press(screen.getByText('Productos'));
    expect(await screen.findByText('Agregar producto')).toBeTruthy();
    for (const accion of [
      'Ingreso',
      'Reponer',
      'Conteo',
      'Categorías',
      'Proveedores',
      'Importar',
    ]) {
      expect(screen.getByText(accion)).toBeTruthy();
    }
    fireEvent.press(screen.getByText('Ingreso'));
    await waitFor(() => expect(pathname()).toBe('/compra'));
  });

  it('un cajero con solo los 4 permisos de caja no ve las acciones de inventario', async () => {
    await prepararBase(true);
    montar();
    await entrar('Carla', '5678');

    fireEvent.press(await screen.findByText('Productos'));
    await screen.findByText('Aún no hay productos.');
    expect(screen.queryByText('Agregar producto')).toBeNull();
    expect(screen.queryByText('Ingreso')).toBeNull();
    expect(screen.queryByText('Conteo')).toBeNull();
  });

  it('quien solo tiene inventario no llega a /estadisticas ni a /usuarios escribiendo la ruta', async () => {
    await prepararBase(true);
    await agregarPersona('Beto', '1111', PERMISOS_BODEGUERO);
    montar();
    await entrar('Beto', '1111');
    await screen.findByText('Productos');

    await irA('/estadisticas');
    expect(screen.queryByText('Reportes del negocio')).toBeNull();
    expect(pathname()).not.toBe('/estadisticas');

    await irA('/usuarios');
    expect(screen.queryByText('Usuarios y permisos')).toBeNull();
    expect(pathname()).not.toBe('/usuarios');

    await irA('/usuario/nuevo');
    expect(pathname()).not.toBe('/usuario/nuevo');
    expect(screen.queryByText('Agregar persona')).toBeNull();
  });

  it('quien tiene mercadería sí llega a /compra', async () => {
    await prepararBase(true);
    await agregarPersona('Beto', '1111', PERMISOS_BODEGUERO);
    montar();
    await entrar('Beto', '1111');
    await screen.findByText('Productos');

    await irA('/compra');
    expect(pathname()).toBe('/compra');
  });

  it.each(['/estadisticas', '/negocio', '/exportar', '/compra'] as const)(
    'un cajero con solo los 4 permisos de caja que escribe %s no llega a esa pantalla',
    async (ruta) => {
      await prepararBase(true);
      montar();
      await entrar('Carla', '5678');
      await screen.findByLabelText('Vender');

      await irA(ruta);

      expect(pathname()).not.toBe(ruta);
    },
  );

  it('un cajero ve Vender y Caja', async () => {
    await prepararBase(true);
    montar();
    await entrar('Carla', '5678');

    expect(await screen.findByLabelText('Vender')).toBeTruthy();
    expect(screen.getByText('Caja')).toBeTruthy();
  });

  it('quien tiene reportes ve "Reportes del negocio" en Más y puede abrirlos', async () => {
    await prepararBase(true);
    await agregarPersona('Rosa', '2222', ['reportes']);
    montar();
    await entrar('Rosa', '2222');

    fireEvent.press(await screen.findByText('Más'));
    expect(await screen.findByText('Reportes del negocio')).toBeTruthy();
    expect(screen.queryByText('Datos del negocio')).toBeNull();
    expect(screen.queryByText('Exportar datos')).toBeNull();

    fireEvent.press(screen.getByText('Reportes del negocio'));
    await waitFor(() => expect(pathname()).toBe('/estadisticas'));
  });

  it('un cajero no ve "Reportes del negocio" en Más', async () => {
    await prepararBase(true);
    montar();
    await entrar('Carla', '5678');

    fireEvent.press(await screen.findByText('Más'));
    expect(await screen.findByText('Cambiar de usuario')).toBeTruthy();
    expect(screen.queryByText('Reportes del negocio')).toBeNull();
  });

  it('una persona sin ningún permiso no ve Vender ni Caja pero puede entrar', async () => {
    await prepararBase(true);
    await agregarPersona('Nadia', '4444', []);
    montar();
    await entrar('Nadia', '4444');

    expect(await screen.findByText('Productos')).toBeTruthy();
    expect(screen.queryByLabelText('Vender')).toBeNull();
    expect(screen.queryByText('Caja')).toBeNull();
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

describe('usuarios y permisos por persona', () => {
  const abrirUsuarios = async () => {
    fireEvent.press(await screen.findByText('Más'));
    fireEvent.press(await screen.findByText('Usuarios y permisos'));
  };
  const abrirPersona = async (nombre: string) => {
    await abrirUsuarios();
    fireEvent.press(await screen.findByLabelText(`Editar a ${nombre}`));
    await screen.findByLabelText('Nombre');
  };
  const interruptor = (texto: string) => screen.getByLabelText(texto);
  const estaActivo = (texto: string) => interruptor(texto).props.value === true;
  const estaDeshabilitado = (texto: string) => interruptor(texto).props.disabled === true;
  const cambiar = (texto: string, valor: boolean) =>
    fireEvent(interruptor(texto), 'valueChange', valor);

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('la lista muestra el resumen de permisos de cada persona', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    await abrirUsuarios();

    expect(await screen.findByText('Todos los permisos')).toBeTruthy();
    expect(
      screen.getByText('Vender y cobrar · Ver ventas anteriores · Caja del día · Clientes y fiado'),
    ).toBeTruthy();
    expect(screen.getByText('Nueva persona')).toBeTruthy();
  });

  it('una persona nueva parte con los 7 permisos iniciales y el dueño apaga uno antes de guardar', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    await irA('/usuario/nuevo');

    fireEvent.changeText(await screen.findByLabelText('Nombre'), '  Pedro  ');
    fireEvent.changeText(screen.getByLabelText('PIN (4 números)'), '4321');
    for (const texto of [
      'Vender y cobrar',
      'Ver ventas anteriores',
      'Caja del día',
      'Clientes y fiado',
      'Editar productos',
      'Ingresos de mercadería',
      'Conteo de stock',
    ]) {
      expect(estaActivo(texto)).toBe(true);
    }
    for (const texto of ['Anular ventas', 'Reportes del negocio', 'Usuarios y permisos']) {
      expect(estaActivo(texto)).toBe(false);
    }

    cambiar('Caja del día', false);
    cambiar('Reportes del negocio', true);
    fireEvent.press(screen.getByText('Agregar persona'));

    await waitFor(async () => {
      expect((await filaDe('Pedro'))?.pendiente).toBe(1);
    });
    expect(await permisosGuardados('Pedro')).toEqual([
      'vender',
      'ventas_ver',
      'fiado',
      'productos_editar',
      'mercaderia',
      'stock',
      'reportes',
    ]);
  });

  it('no agrega a la persona sin nombre ni con un PIN incompleto', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    await irA('/usuario/nuevo');

    fireEvent.press(await screen.findByText('Agregar persona'));
    expect(await screen.findByText('Ingresa el nombre de la persona.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Nombre'), 'Pedro');
    fireEvent.changeText(screen.getByLabelText('PIN (4 números)'), '12');
    fireEvent.press(screen.getByText('Agregar persona'));
    expect(await screen.findByText('El PIN debe tener 4 números.')).toBeTruthy();
    expect(await filaDe('Pedro')).toBeNull();
  });

  it('el dueño edita los permisos de otra persona y queda pendiente de sincronizar', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    await abrirPersona('Carla');

    expect(estaActivo('Vender y cobrar')).toBe(true);
    expect(estaActivo('Editar productos')).toBe(false);
    cambiar('Editar productos', true);
    cambiar('Clientes y fiado', false);
    fireEvent.press(screen.getByText('Guardar'));

    await waitFor(async () => {
      expect(await permisosGuardados('Carla')).toEqual([
        'vender',
        'ventas_ver',
        'caja',
        'productos_editar',
      ]);
    });
    expect((await filaDe('Carla'))!.pendiente).toBeGreaterThan(1);
    // El dueño no cambió.
    expect(await permisosGuardados('Ana')).toEqual([]);
  });

  it('el dueño renombra a una persona y la desactiva', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    await abrirPersona('Carla');

    fireEvent.changeText(screen.getByLabelText('Nombre'), '  Carla   Soto ');
    cambiar('Activo', false);
    fireEvent.press(screen.getByText('Guardar'));

    await waitFor(async () => {
      expect(await filaDe('Carla Soto')).not.toBeNull();
    });
    expect((await filaDe('Carla Soto'))!.activo).toBe(0);
    expect(await filaDe('Carla')).toBeNull();
  });

  it('al editar al dueño solo se cambia nombre y PIN: sin interruptores ni "Activo"', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    await abrirPersona('Ana');

    expect(screen.getByText('Dueño: tiene todos los permisos.')).toBeTruthy();
    expect(screen.queryByLabelText('Activo')).toBeNull();
    expect(screen.queryByLabelText('Vender y cobrar')).toBeNull();
    expect(screen.getByLabelText('PIN nuevo (déjalo vacío para no cambiarlo)')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Nombre'), 'Ana María');
    fireEvent.press(screen.getByText('Guardar'));
    await waitFor(async () => {
      expect(await filaDe('Ana María')).not.toBeNull();
    });
    expect(await permisosGuardados('Ana María')).toEqual([]);
  });

  describe('quien tiene "usuarios" sin ser dueño', () => {
    const PERMISOS_UMA: Permiso[] = [...PERMISOS_CAJERO, 'usuarios'];

    it('no puede editar al dueño', async () => {
      await prepararBase(true);
      await agregarPersona('Uma', '3333', PERMISOS_UMA);
      montar();
      await entrar('Uma', '3333');
      await abrirPersona('Ana');

      expect(await screen.findByText('Solo el dueño puede cambiar sus datos.')).toBeTruthy();
      expect(screen.queryByText('Guardar')).toBeNull();
      expect(screen.queryByLabelText('PIN nuevo (déjalo vacío para no cambiarlo)')).toBeNull();
      expect(screen.getByLabelText('Nombre').props.editable).toBe(false);
    });

    it('no puede cambiar sus propios permisos', async () => {
      await prepararBase(true);
      await agregarPersona('Uma', '3333', PERMISOS_UMA);
      montar();
      await entrar('Uma', '3333');
      await abrirPersona('Uma');

      expect(await screen.findByText(/No puedes cambiar tus propios permisos/)).toBeTruthy();
      expect(estaDeshabilitado('Vender y cobrar')).toBe(true);
      expect(estaDeshabilitado('Usuarios y permisos')).toBe(true);
      expect(screen.queryByLabelText('Activo')).toBeNull();
      // Sí puede cambiarse el PIN.
      expect(screen.getByLabelText('PIN nuevo (déjalo vacío para no cambiarlo)')).toBeTruthy();
    });

    it('no puede activar un permiso que no tiene, solo los suyos', async () => {
      await prepararBase(true);
      await agregarPersona('Uma', '3333', PERMISOS_UMA);
      montar();
      await entrar('Uma', '3333');
      await abrirPersona('Carla');

      expect(estaDeshabilitado('Anular ventas')).toBe(true);
      expect(estaDeshabilitado('Reportes del negocio')).toBe(true);
      // Uma tiene "usuarios": puede dárselo a otra persona.
      expect(estaDeshabilitado('Usuarios y permisos')).toBe(false);
      expect(estaDeshabilitado('Editar productos')).toBe(true);
      expect(estaDeshabilitado('Caja del día')).toBe(false);

      // Aunque el evento llegara, no se guarda un permiso ajeno.
      cambiar('Anular ventas', true);
      fireEvent.press(screen.getByText('Guardar'));
      await act(async () => {});
      expect(await permisosGuardados('Carla')).toEqual([...PERMISOS_CAJERO]);
    });

    it('sí puede dar y quitar los permisos que tiene', async () => {
      await prepararBase(true);
      await agregarPersona('Uma', '3333', PERMISOS_UMA);
      montar();
      await entrar('Uma', '3333');
      await abrirPersona('Carla');

      cambiar('Caja del día', false);
      fireEvent.press(screen.getByText('Guardar'));
      await waitFor(async () => {
        expect(await permisosGuardados('Carla')).toEqual(['vender', 'ventas_ver', 'fiado']);
      });
    });

    it('no puede editar a quien tiene permisos que él no tiene', async () => {
      await prepararBase(true);
      await agregarPersona('Uma', '3333', PERMISOS_UMA);
      await agregarPersona('Rosa', '2222', ['vender', 'reportes']);
      montar();
      await entrar('Uma', '3333');
      await abrirPersona('Rosa');

      expect(await screen.findByText('Esta persona tiene permisos que tú no tienes.')).toBeTruthy();
      expect(screen.queryByText('Guardar')).toBeNull();
      expect(estaDeshabilitado('Vender y cobrar')).toBe(true);
    });

    it('la persona nueva parte solo con los iniciales que él puede dar', async () => {
      await prepararBase(true);
      // Uma puede agregar personas, pero no tiene "Editar productos" ni inventario.
      await agregarPersona('Uma', '3333', ['usuarios', 'vender', 'caja']);
      montar();
      await entrar('Uma', '3333');
      await irA('/usuario/nuevo');

      await screen.findByLabelText('Nombre');
      expect(estaActivo('Vender y cobrar')).toBe(true);
      expect(estaActivo('Caja del día')).toBe(true);
      expect(estaActivo('Editar productos')).toBe(false);
      expect(estaDeshabilitado('Editar productos')).toBe(true);
    });
  });
});
