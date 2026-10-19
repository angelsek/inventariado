import { migrarBaseDeDatos } from '../migraciones';
import { borrarDatosLocales } from '../negocio';
import { asignarRol, crearPerfil, listarPerfiles, obtenerPerfil } from '../perfiles';
import {
  actualizarRol,
  contarPersonasPorRol,
  crearRol,
  eliminarRol,
  listarRoles,
  obtenerRol,
} from '../roles';
import type { BaseLocal } from '../tipos';
import { cargarRolSesion } from '@/sesion/permisos';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';
const AHORA = '2026-10-19T10:00:00.000Z';

let db: BaseLocal;

async function insertarRol(
  id: string,
  nombre: string,
  permisos: string,
  predefinido: string | null = null,
  { eliminado = 0, negocio = NEGOCIO } = {},
) {
  await db.runAsync(
    `INSERT INTO roles (id, negocio_id, nombre, permisos, predefinido, creado_en, actualizado_en, eliminado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    negocio,
    nombre,
    permisos,
    predefinido,
    AHORA,
    AHORA,
    eliminado,
  );
}

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
});

describe('listarRoles', () => {
  it('sin roles devuelve una lista vacía', async () => {
    expect(await listarRoles(db, NEGOCIO)).toEqual([]);
  });

  it('ordena primero los predefinidos y luego el resto por nombre', async () => {
    await insertarRol('r-z', 'zapatero', '[]');
    await insertarRol('r-b', 'Bodeguero', '["stock"]', 'bodeguero');
    await insertarRol('r-a', 'Ayudante', '[]');
    await insertarRol('r-c', 'Cajero', '["vender"]', 'cajero');
    await insertarRol('r-adm', 'Administrador', '["usuarios"]', 'administrador');

    expect((await listarRoles(db, NEGOCIO)).map((r) => r.nombre)).toEqual([
      'Administrador',
      'Cajero',
      'Bodeguero',
      'Ayudante',
      'zapatero',
    ]);
  });

  it('no incluye roles eliminados ni de otro negocio', async () => {
    await insertarRol('r-1', 'Cajero', '[]', 'cajero');
    await insertarRol('r-2', 'Borrado', '[]', null, { eliminado: 1 });
    await insertarRol('r-3', 'Ajeno', '[]', null, { negocio: 'otro' });

    expect((await listarRoles(db, NEGOCIO)).map((r) => r.id)).toEqual(['r-1']);
  });

  it('lee los permisos guardados como texto JSON y descarta lo inválido', async () => {
    await insertarRol('r-1', 'Mixto', '["vender","inventada","vender","caja"]');
    await insertarRol('r-2', 'Roto', 'esto no es json');
    await insertarRol('r-3', 'Objeto', '{"vender":true}');

    const roles = await listarRoles(db, NEGOCIO);
    expect(roles.find((r) => r.id === 'r-1')?.permisos).toEqual(['vender', 'caja']);
    expect(roles.find((r) => r.id === 'r-2')?.permisos).toEqual([]);
    expect(roles.find((r) => r.id === 'r-3')?.permisos).toEqual([]);
  });

  it('convierte eliminado a booleano y conserva predefinido', async () => {
    await insertarRol('r-1', 'Cajero', '[]', 'cajero');
    const [rol] = await listarRoles(db, NEGOCIO);
    expect(rol).toMatchObject({
      id: 'r-1',
      negocio_id: NEGOCIO,
      predefinido: 'cajero',
      eliminado: false,
    });
  });
});

describe('obtenerRol', () => {
  it('devuelve null si no existe', async () => {
    expect(await obtenerRol(db, 'nada')).toBeNull();
  });

  it('incluye los roles eliminados (marcados)', async () => {
    await insertarRol('r-1', 'Viejo', '["vender"]', null, { eliminado: 1 });
    expect(await obtenerRol(db, 'r-1')).toMatchObject({
      nombre: 'Viejo',
      permisos: ['vender'],
      eliminado: true,
    });
  });
});

describe('cargarRolSesion', () => {
  it('el dueño y la persona sin rol_id no tienen rol en la sesión', async () => {
    const dueno = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Ana',
      rol: 'dueno',
      pin: '1234',
      rolId: 'r-1',
    });
    const sinRol = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Carla',
      rol: 'cajero',
      pin: '1234',
    });
    expect(await cargarRolSesion(db, dueno)).toBeNull();
    expect(await cargarRolSesion(db, sinRol)).toBeNull();
  });

  it('carga nombre, permisos y estado del rol', async () => {
    await insertarRol('r-1', 'Bodeguero', '["stock"]', 'bodeguero');
    const p = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Beto',
      rol: 'cajero',
      pin: '1234',
      rolId: 'r-1',
    });
    expect(await cargarRolSesion(db, p)).toEqual({
      nombre: 'Bodeguero',
      permisos: ['stock'],
      eliminado: false,
    });
  });

  it('un rol_id que aún no llegó a la base local devuelve null (queda como Cajero)', async () => {
    const p = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Beto',
      rol: 'cajero',
      pin: '1234',
      rolId: 'desconocido',
    });
    expect(await cargarRolSesion(db, p)).toBeNull();
  });
});

describe('perfiles y roles', () => {
  it('crearPerfil guarda el rol_id de una persona y lo marca pendiente', async () => {
    const p = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: ' Beto ',
      rol: 'cajero',
      pin: '1234',
      rolId: 'r-1',
    });
    expect(p).toMatchObject({ nombre: 'Beto', rol_id: 'r-1' });
    expect(await obtenerPerfil(db, p.id)).toMatchObject({ rol_id: 'r-1' });
  });

  it('crearPerfil nunca guarda rol_id en el dueño', async () => {
    const p = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Ana',
      rol: 'dueno',
      pin: '1234',
      rolId: 'r-1',
    });
    expect(p.rol_id).toBeNull();
    expect((await listarPerfiles(db, NEGOCIO))[0].rol_id).toBeNull();
  });

  it('asignarRol cambia el rol y sube la cuenta de pendientes', async () => {
    const p = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Beto',
      rol: 'cajero',
      pin: '1234',
      rolId: 'r-1',
    });
    await db.runAsync('UPDATE perfiles SET pendiente = 0 WHERE id = ?', p.id);

    await asignarRol(db, p.id, 'r-2');
    const fila = await db.getFirstAsync<{ rol_id: string; pendiente: number }>(
      'SELECT rol_id, pendiente FROM perfiles WHERE id = ?',
      p.id,
    );
    expect(fila).toEqual({ rol_id: 'r-2', pendiente: 1 });

    await asignarRol(db, p.id, 'r-3');
    const otra = await db.getFirstAsync<{ pendiente: number }>(
      'SELECT pendiente FROM perfiles WHERE id = ?',
      p.id,
    );
    expect(otra?.pendiente).toBe(2);
  });

  it('asignarRol no cambia al dueño ni lo marca pendiente', async () => {
    const dueno = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Ana',
      rol: 'dueno',
      pin: '1234',
    });
    await db.runAsync('UPDATE perfiles SET pendiente = 0 WHERE id = ?', dueno.id);

    await asignarRol(db, dueno.id, 'r-2');
    const fila = await db.getFirstAsync<{ rol_id: string | null; pendiente: number }>(
      'SELECT rol_id, pendiente FROM perfiles WHERE id = ?',
      dueno.id,
    );
    expect(fila).toEqual({ rol_id: null, pendiente: 0 });
  });

  it('asignarRol sobre un perfil que no existe no falla ni inventa filas', async () => {
    await asignarRol(db, 'nadie', 'r-1');
    expect(await listarPerfiles(db, NEGOCIO)).toEqual([]);
  });
});

const pendienteDe = async (id: string) =>
  (await db.getFirstAsync<{ pendiente: number }>('SELECT pendiente FROM roles WHERE id = ?', id))
    ?.pendiente;

describe('crearRol', () => {
  it('guarda el rol normalizado, con permisos ordenados y pendiente 1', async () => {
    const rol = await crearRol(db, {
      negocioId: NEGOCIO,
      nombre: '  Jefe   de turno ',
      permisos: ['stock', 'vender', 'stock'],
    });
    expect(rol).toMatchObject({
      nombre: 'Jefe de turno',
      permisos: ['vender', 'stock'],
      predefinido: null,
      eliminado: false,
    });
    expect(await obtenerRol(db, rol.id)).toEqual(rol);
    expect(await pendienteDe(rol.id)).toBe(1);
  });

  it('rechaza nombres vacíos, reservados y repetidos sin guardar nada', async () => {
    await insertarRol('r-1', 'Cajero', '[]', 'cajero');
    for (const nombre of ['  ', 'Dueño', 'cajero']) {
      await expect(crearRol(db, { negocioId: NEGOCIO, nombre, permisos: [] })).rejects.toThrow();
    }
    expect(await listarRoles(db, NEGOCIO)).toHaveLength(1);
  });

  it('permite reutilizar el nombre de un rol eliminado', async () => {
    await insertarRol('r-1', 'Viejo', '[]', null, { eliminado: 1 });
    await expect(
      crearRol(db, { negocioId: NEGOCIO, nombre: 'viejo', permisos: [] }),
    ).resolves.toMatchObject({ nombre: 'viejo' });
  });

  it('el mismo nombre en otro negocio no choca', async () => {
    await insertarRol('r-1', 'Supervisor', '[]', null, { negocio: 'otro' });
    await expect(
      crearRol(db, { negocioId: NEGOCIO, nombre: 'Supervisor', permisos: [] }),
    ).resolves.toBeDefined();
  });
});

describe('actualizarRol', () => {
  it('cambia nombre y permisos y suma pendientes', async () => {
    await insertarRol('r-1', 'Ayudante', '["vender"]');
    const antes = (await pendienteDe('r-1')) ?? 0;
    await actualizarRol(db, 'r-1', { nombre: ' Auxiliar ', permisos: ['caja', 'vender'] });
    expect(await obtenerRol(db, 'r-1')).toMatchObject({
      nombre: 'Auxiliar',
      permisos: ['vender', 'caja'],
    });
    expect(await pendienteDe('r-1')).toBe(antes + 1);
    await actualizarRol(db, 'r-1', { permisos: [] });
    expect(await pendienteDe('r-1')).toBe(antes + 2);
    expect((await obtenerRol(db, 'r-1'))?.nombre).toBe('Auxiliar');
  });

  it('sin cambiar el nombre solo cambia permisos', async () => {
    await insertarRol('r-1', 'Ayudante', '[]');
    await actualizarRol(db, 'r-1', { nombre: 'Ayudante', permisos: ['stock'] });
    expect(await obtenerRol(db, 'r-1')).toMatchObject({ nombre: 'Ayudante', permisos: ['stock'] });
  });

  it('un predefinido cambia permisos pero no se renombra', async () => {
    await insertarRol('r-1', 'Cajero', '["vender"]', 'cajero');
    await actualizarRol(db, 'r-1', { nombre: 'Cajero', permisos: ['vender', 'caja'] });
    expect((await obtenerRol(db, 'r-1'))?.permisos).toEqual(['vender', 'caja']);
    await expect(actualizarRol(db, 'r-1', { nombre: 'Otro' })).rejects.toThrow(/predefinidos/);
    expect((await obtenerRol(db, 'r-1'))?.nombre).toBe('Cajero');
  });

  it('rechaza un nombre repetido, pero deja cambiar las mayúsculas del propio', async () => {
    await insertarRol('r-1', 'Ayudante', '[]');
    await insertarRol('r-2', 'Auxiliar', '[]');
    await expect(actualizarRol(db, 'r-1', { nombre: 'auxiliar' })).rejects.toThrow(/Ya existe/);
    await actualizarRol(db, 'r-1', { nombre: 'AYUDANTE' });
    expect((await obtenerRol(db, 'r-1'))?.nombre).toBe('AYUDANTE');
  });

  it('un rol inexistente o eliminado falla', async () => {
    await expect(actualizarRol(db, 'nada', { permisos: [] })).rejects.toThrow(/no encontrado/);
    await insertarRol('r-1', 'Viejo', '[]', null, { eliminado: 1 });
    await expect(actualizarRol(db, 'r-1', { permisos: [] })).rejects.toThrow(/no encontrado/);
  });
});

describe('eliminarRol', () => {
  const persona = (rolId: string) =>
    crearPerfil(db, { negocioId: NEGOCIO, nombre: 'Beto', rol: 'cajero', pin: '1234', rolId });

  it('marca el rol como eliminado y pendiente', async () => {
    await insertarRol('r-1', 'Ayudante', '[]');
    const antes = (await pendienteDe('r-1')) ?? 0;
    await eliminarRol(db, 'r-1');
    expect((await obtenerRol(db, 'r-1'))?.eliminado).toBe(true);
    expect(await pendienteDe('r-1')).toBe(antes + 1);
    expect(await listarRoles(db, NEGOCIO)).toEqual([]);
  });

  it('no elimina predefinidos', async () => {
    await insertarRol('r-1', 'Cajero', '[]', 'cajero');
    await expect(eliminarRol(db, 'r-1')).rejects.toThrow(/predefinidos/);
    expect((await obtenerRol(db, 'r-1'))?.eliminado).toBe(false);
  });

  it('no elimina con personas, ni siquiera desactivadas', async () => {
    await insertarRol('r-1', 'Ayudante', '[]');
    const p = await persona('r-1');
    await expect(eliminarRol(db, 'r-1')).rejects.toThrow(/Cambia de rol/);
    await db.runAsync('UPDATE perfiles SET activo = 0 WHERE id = ?', p.id);
    await expect(eliminarRol(db, 'r-1')).rejects.toThrow(/Cambia de rol/);
  });

  it('sí elimina si la única persona está eliminada', async () => {
    await insertarRol('r-1', 'Ayudante', '[]');
    const p = await persona('r-1');
    await db.runAsync('UPDATE perfiles SET eliminado = 1 WHERE id = ?', p.id);
    await eliminarRol(db, 'r-1');
    expect((await obtenerRol(db, 'r-1'))?.eliminado).toBe(true);
  });

  it('un rol inexistente o ya eliminado falla', async () => {
    await expect(eliminarRol(db, 'nada')).rejects.toThrow(/no encontrado/);
    await insertarRol('r-1', 'Viejo', '[]', null, { eliminado: 1 });
    await expect(eliminarRol(db, 'r-1')).rejects.toThrow(/no encontrado/);
  });
});

describe('contarPersonasPorRol', () => {
  const nuevo = (nombre: string, rol: 'dueno' | 'cajero', rolId?: string) =>
    crearPerfil(db, { negocioId: NEGOCIO, nombre, rol, pin: '1234', rolId });

  it('sin personas devuelve vacío', async () => {
    await insertarRol('r-c', 'Cajero', '[]', 'cajero');
    expect(await contarPersonasPorRol(db, NEGOCIO)).toEqual({});
  });

  it('cuenta por rol, sin el dueño ni eliminados', async () => {
    await insertarRol('r-c', 'Cajero', '[]', 'cajero');
    await insertarRol('r-a', 'Ayudante', '[]');
    await nuevo('Ana', 'dueno');
    await nuevo('B', 'cajero', 'r-a');
    await nuevo('C', 'cajero', 'r-a');
    const d = await nuevo('D', 'cajero', 'r-a');
    await db.runAsync('UPDATE perfiles SET eliminado = 1 WHERE id = ?', d.id);
    await nuevo('E', 'cajero', 'r-c');
    expect(await contarPersonasPorRol(db, NEGOCIO)).toEqual({ 'r-a': 2, 'r-c': 1 });
  });

  it('sin rol, con rol eliminado o desconocido cuenta como Cajero', async () => {
    await insertarRol('r-c', 'Cajero', '[]', 'cajero');
    await insertarRol('r-x', 'Viejo', '[]', null, { eliminado: 1 });
    await nuevo('A', 'cajero');
    await nuevo('B', 'cajero', 'r-x');
    await nuevo('C', 'cajero', 'inexistente');
    expect(await contarPersonasPorRol(db, NEGOCIO)).toEqual({ 'r-c': 3 });
  });

  it('sin rol Cajero en la base no cuenta a quien no tiene rol vigente', async () => {
    await nuevo('A', 'cajero');
    expect(await contarPersonasPorRol(db, NEGOCIO)).toEqual({});
  });
});

it('cerrar sesión o eliminar la cuenta borra los roles del equipo', async () => {
  await insertarRol('r-cajero', 'Cajero', '["vender"]', 'cajero');
  await borrarDatosLocales(db);
  expect(await listarRoles(db, NEGOCIO)).toEqual([]);
  expect(await obtenerRol(db, 'r-cajero')).toBeNull();
});
