import { router } from 'expo-router';
import { Alert } from 'react-native';
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

const irA = async (
  ruta:
    '/estadisticas' | '/negocio' | '/exportar' | '/compra' | '/usuarios' | '/roles' | '/rol/nuevo',
) => {
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

describe('editor de roles', () => {
  const abrirRoles = async () => {
    fireEvent.press(await screen.findByText('Más'));
    fireEvent.press(await screen.findByText('Usuarios y permisos'));
    fireEvent.press(await screen.findByText('Editar roles y permisos'));
  };

  const insertarRolPropio = async (id: string, nombre: string, permisos: string[]) => {
    const ahora = new Date().toISOString();
    await mockDb.runAsync(
      `INSERT INTO roles (id, negocio_id, nombre, permisos, predefinido, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      id,
      NEGOCIO,
      nombre,
      JSON.stringify(permisos),
      ahora,
      ahora,
    );
  };

  it('un Bodeguero no llega a /roles ni a /rol/nuevo escribiendo la ruta', async () => {
    await prepararBase(true);
    await agregarPersona('Beto', 'rol-bodeguero', '1111');
    montar();
    await entrar('Beto', '1111');
    await screen.findByText('Productos');

    await irA('/roles');
    expect(pathname()).not.toBe('/roles');
    expect(screen.queryByText('Nuevo rol')).toBeNull();

    await irA('/rol/nuevo');
    expect(pathname()).not.toBe('/rol/nuevo');
    expect(screen.queryByText('Crear rol')).toBeNull();
  });

  it('el dueño crea un rol desde Usuarios y permisos y queda pendiente en la base', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    await abrirRoles();

    fireEvent.press(await screen.findByText('Nuevo rol'));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), '  Jefe de turno ');
    fireEvent(screen.getByLabelText('Vender y cobrar'), 'valueChange', true);
    fireEvent.press(screen.getByText('Crear rol'));

    await waitFor(async () => {
      const fila = await mockDb.getFirstAsync<{
        nombre: string;
        permisos: string;
        predefinido: string | null;
        pendiente: number;
      }>(
        "SELECT nombre, permisos, predefinido, pendiente FROM roles WHERE nombre = 'Jefe de turno'",
      );
      expect(fila).toEqual({
        nombre: 'Jefe de turno',
        permisos: '["vender"]',
        predefinido: null,
        pendiente: 1,
      });
    });
  });

  it('crear un rol con el nombre de otro muestra el error y no guarda nada', async () => {
    await prepararBase(true);
    montar();
    await entrar('Ana', '1234');
    await abrirRoles();

    fireEvent.press(await screen.findByText('Nuevo rol'));
    fireEvent.changeText(await screen.findByLabelText('Nombre'), 'cajero');
    fireEvent.press(screen.getByText('Crear rol'));

    expect(await screen.findByText(/Ya existe un rol llamado "Cajero"/)).toBeTruthy();
    const n = await mockDb.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM roles');
    expect(n?.n).toBe(ROLES.length);
  });

  it('un Administrador que no es dueño ve su propio rol sin botón Guardar', async () => {
    await prepararBase(true);
    await agregarPersona('Uma', 'rol-admin', '3333');
    montar();
    await entrar('Uma', '3333');
    await abrirRoles();

    fireEvent.press(await screen.findByLabelText('Rol Administrador'));

    expect(await screen.findByText(/No puedes cambiar tu propio rol/)).toBeTruthy();
    expect(screen.queryByText('Guardar')).toBeNull();
    expect(screen.queryByText('Restablecer')).toBeNull();
  });

  it('un rol con reportes y usuarios no ve Administrador ni "Cambiar PIN" de Uma', async () => {
    await prepararBase(true);
    await insertarRolPropio('rol-gerente', 'Gerente', ['reportes', 'usuarios']);
    await agregarPersona('Gus', 'rol-gerente', '4444');
    await agregarPersona('Uma', 'rol-admin', '3333');
    montar();
    await entrar('Gus', '4444');
    fireEvent.press(await screen.findByText('Más'));
    fireEvent.press(await screen.findByText('Usuarios y permisos'));

    await screen.findByText('Uma');
    // Solo la etiqueta del rol de Uma: Administrador no es una opción para nadie.
    expect(screen.getAllByText('Administrador')).toHaveLength(1);
    expect(screen.queryByLabelText('Activo: Uma')).toBeNull();
    // Gus solo puede cambiarse el PIN a sí mismo: Uma (Administrador) y Carla (Cajero) tienen más.
    expect(screen.getAllByText('Cambiar PIN')).toHaveLength(1);
    expect(screen.queryByLabelText('Activo: Carla')).toBeNull();
    // Sí puede dar los roles que no superan al suyo.
    expect(screen.getAllByText('Analista').length).toBeGreaterThan(0);
  });

  it('el dueño elimina un rol propio sin personas', async () => {
    await prepararBase(true);
    await insertarRolPropio('rol-temporal', 'Temporal', ['stock']);
    const alerta = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    montar();
    await entrar('Ana', '1234');
    await abrirRoles();

    fireEvent.press(await screen.findByLabelText('Rol Temporal'));
    fireEvent.press(await screen.findByText('Eliminar rol'));
    expect(alerta).toHaveBeenCalledWith('Eliminar rol', expect.stringContaining('Temporal'), [
      expect.objectContaining({ text: 'Cancelar' }),
      expect.objectContaining({ text: 'Eliminar' }),
    ]);
    const botones = alerta.mock.calls[0][2]!;
    await act(async () => {
      botones.find((b) => b.text === 'Eliminar')!.onPress!();
    });

    await waitFor(async () => {
      const fila = await mockDb.getFirstAsync<{ eliminado: number; pendiente: number }>(
        "SELECT eliminado, pendiente FROM roles WHERE id = 'rol-temporal'",
      );
      expect(fila?.eliminado).toBe(1);
      expect(fila?.pendiente).toBeGreaterThan(0);
    });
    alerta.mockRestore();
  });

  it('un rol con personas no ofrece "Eliminar rol"', async () => {
    await prepararBase(true);
    await insertarRolPropio('rol-temporal', 'Temporal', ['stock']);
    await agregarPersona('Tina', 'rol-temporal', '5555');
    montar();
    await entrar('Ana', '1234');
    await abrirRoles();

    fireEvent.press(await screen.findByLabelText('Rol Temporal'));
    expect(await screen.findByText(/primero cambia de rol a sus personas/)).toBeTruthy();
    expect(screen.queryByText('Eliminar rol')).toBeNull();
  });
});
