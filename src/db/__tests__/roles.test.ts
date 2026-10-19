import { migrarBaseDeDatos } from '../migraciones';
import { asignarRol, crearPerfil, listarPerfiles, obtenerPerfil } from '../perfiles';
import { listarRoles, obtenerRol } from '../roles';
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
