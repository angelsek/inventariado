import { PERMISOS_INICIALES } from '@/features/permisos/catalogo';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

import { migrarBaseDeDatos } from '../migraciones';
import {
  cambiarActivo,
  cambiarNombre,
  cambiarPermisos,
  cambiarPin,
  crearPerfil,
  listarPerfiles,
  obtenerPerfil,
  type Rol,
  verificarPin,
} from '../perfiles';
import type { BaseLocal } from '../tipos';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';
let db: BaseLocal;

const nueva = (nombre: string, rol: Rol = 'cajero') =>
  crearPerfil(db, { negocioId: NEGOCIO, nombre, rol, pin: '1234' });
const pendiente = async (id: string) =>
  (await db.getFirstAsync<{ pendiente: number }>(
    'SELECT pendiente FROM perfiles WHERE id = ?',
    id,
  ))!.pendiente;
const textoPermisos = async (id: string) =>
  (await db.getFirstAsync<{ permisos: string }>('SELECT permisos FROM perfiles WHERE id = ?', id))!
    .permisos;

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
});

describe('crearPerfil', () => {
  it('sin lista de permisos parte con los permisos iniciales', async () => {
    const carla = await nueva('Carla');

    expect(carla.permisos).toEqual([...PERMISOS_INICIALES]);
    expect((await obtenerPerfil(db, carla.id))?.permisos).toEqual([...PERMISOS_INICIALES]);
    expect(await pendiente(carla.id)).toBe(1);
  });

  it('con lista explícita la guarda ordenada, sin repetidos ni claves desconocidas', async () => {
    const beto = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Beto',
      rol: 'cajero',
      pin: '1234',
      permisos: ['stock', 'vender', 'stock', 'inventada'] as never,
    });

    expect(beto.permisos).toEqual(['vender', 'stock']);
    expect(await textoPermisos(beto.id)).toBe('["vender","stock"]');
  });

  it('una lista explícita vacía no cae a los iniciales', async () => {
    const sin = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Sin',
      rol: 'cajero',
      pin: '1234',
      permisos: [],
    });

    expect(sin.permisos).toEqual([]);
    expect(await textoPermisos(sin.id)).toBe('[]');
  });

  it('el dueño se guarda con lista vacía, aunque se le den permisos', async () => {
    const ana = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'Ana',
      rol: 'dueno',
      pin: '1234',
      permisos: ['vender'],
    });
    const sinLista = await nueva('Otra dueña', 'dueno');

    expect(ana.permisos).toEqual([]);
    expect(await textoPermisos(ana.id)).toBe('[]');
    expect(await textoPermisos(sinLista.id)).toBe('[]');
  });

  it('normaliza el nombre y el PIN sirve para verificar', async () => {
    const carla = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: '  Carla   Pérez ',
      rol: 'cajero',
      pin: '5678',
    });

    expect(carla.nombre).toBe('Carla Pérez');
    expect(await verificarPin(db, carla.id, '5678')).toBe(true);
    expect(await verificarPin(db, carla.id, '0000')).toBe(false);
  });
});

describe('cambiarPermisos', () => {
  it('guarda los permisos ordenados y suma uno a pendiente', async () => {
    const beto = await nueva('Beto');

    await cambiarPermisos(db, beto.id, ['reportes', 'caja', 'reportes']);

    expect((await obtenerPerfil(db, beto.id))?.permisos).toEqual(['caja', 'reportes']);
    expect(await pendiente(beto.id)).toBe(2);
  });

  it('anota cuándo cambiaron los permisos; el PIN no mueve esa fecha', async () => {
    const beto = await nueva('Beto');
    const fecha = async () =>
      (
        await db.getFirstAsync<{ permisos_en: string }>(
          'SELECT permisos_en FROM perfiles WHERE id = ?',
          beto.id,
        )
      )?.permisos_en;
    const alCrear = await fecha();
    expect(alCrear).toBeTruthy();

    await cambiarPin(db, beto.id, '9999');
    expect(await fecha()).toBe(alCrear);

    await new Promise((r) => setTimeout(r, 5));
    await cambiarPermisos(db, beto.id, ['caja']);
    expect((await fecha())! > alCrear!).toBe(true);
  });

  it('puede dejar a la persona sin ningún permiso', async () => {
    const beto = await nueva('Beto');
    await cambiarPermisos(db, beto.id, []);
    expect((await obtenerPerfil(db, beto.id))?.permisos).toEqual([]);
  });

  it('no toca al dueño ni suma pendiente', async () => {
    const ana = await nueva('Ana', 'dueno');

    await cambiarPermisos(db, ana.id, ['vender']);

    expect(await textoPermisos(ana.id)).toBe('[]');
    expect(await pendiente(ana.id)).toBe(1);
  });

  it('un id inexistente no falla ni cambia a nadie', async () => {
    const beto = await nueva('Beto');
    await cambiarPermisos(db, 'no-existe', ['vender']);
    expect((await obtenerPerfil(db, beto.id))?.permisos).toEqual([...PERMISOS_INICIALES]);
    expect(await pendiente(beto.id)).toBe(1);
  });
});

describe('cambiarNombre y cambiarPin', () => {
  it('cambiarNombre limpia los espacios y suma pendiente', async () => {
    const beto = await nueva('Beto');

    await cambiarNombre(db, beto.id, '  Alberto  Díaz ');

    expect((await obtenerPerfil(db, beto.id))?.nombre).toBe('Alberto Díaz');
    expect(await pendiente(beto.id)).toBe(2);
  });

  it('cambiarNombre sirve también para el dueño (la pantalla decide quién puede)', async () => {
    const ana = await nueva('Ana', 'dueno');
    await cambiarNombre(db, ana.id, 'Ana María');
    expect((await obtenerPerfil(db, ana.id))?.nombre).toBe('Ana María');
  });

  it('cambiarPin reemplaza el PIN', async () => {
    const beto = await nueva('Beto');
    await cambiarPin(db, beto.id, '9999');
    expect(await verificarPin(db, beto.id, '1234')).toBe(false);
    expect(await verificarPin(db, beto.id, '9999')).toBe(true);
  });
});

describe('cambiarActivo', () => {
  it('desactiva y reactiva a una persona, con pendiente', async () => {
    const beto = await nueva('Beto');

    await cambiarActivo(db, beto.id, false);
    expect((await obtenerPerfil(db, beto.id))?.activo).toBe(false);
    expect(await verificarPin(db, beto.id, '1234')).toBe(false);
    expect(await pendiente(beto.id)).toBe(2);

    await cambiarActivo(db, beto.id, true);
    expect((await obtenerPerfil(db, beto.id))?.activo).toBe(true);
    expect(await verificarPin(db, beto.id, '1234')).toBe(true);
  });

  it('no desactiva al dueño', async () => {
    const ana = await nueva('Ana', 'dueno');

    await cambiarActivo(db, ana.id, false);

    expect((await obtenerPerfil(db, ana.id))?.activo).toBe(true);
    expect(await pendiente(ana.id)).toBe(1);
  });
});

describe('listarPerfiles', () => {
  it('pone al dueño primero, filtra activos y lee los permisos', async () => {
    await nueva('Zoe');
    const beto = await crearPerfil(db, {
      negocioId: NEGOCIO,
      nombre: 'beto',
      rol: 'cajero',
      pin: '2222',
      permisos: ['stock'],
    });
    await nueva('Ana', 'dueno');
    await crearPerfil(db, { negocioId: 'otro', nombre: 'Ajeno', rol: 'cajero', pin: '4444' });
    await cambiarActivo(db, beto.id, false);

    const todos = await listarPerfiles(db, NEGOCIO);
    expect(todos.map((p) => p.nombre)).toEqual(['Ana', 'beto', 'Zoe']);
    expect(todos.find((p) => p.nombre === 'beto')?.permisos).toEqual(['stock']);
    const activos = await listarPerfiles(db, NEGOCIO, { soloActivos: true });
    expect(activos.map((p) => p.nombre)).toEqual(['Ana', 'Zoe']);
  });

  it('un texto de permisos dañado se lee como lista vacía', async () => {
    const beto = await nueva('Beto');
    await db.runAsync("UPDATE perfiles SET permisos = 'no es json' WHERE id = ?", beto.id);
    expect((await obtenerPerfil(db, beto.id))?.permisos).toEqual([]);
  });
});
