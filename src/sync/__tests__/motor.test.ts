import { migrarBaseDeDatos } from '@/db/migraciones';
import { cambiarActivo, crearPerfil, listarPerfiles } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { crearRemotoFalso } from '@/test/remotoFalso';

import { contarPendientes, sincronizar } from '../motor';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';

async function nuevoTelefono(): Promise<BaseLocal> {
  const db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  return db;
}

describe('sincronizar', () => {
  it('lleva un perfil creado en un teléfono al otro', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();

    await crearPerfil(a, { negocioId: NEGOCIO, nombre: 'Carla', rol: 'cajero', pin: '1234' });
    expect(await contarPendientes(a)).toBe(1);

    expect(await sincronizar(a, remoto, NEGOCIO)).toMatchObject({ subidas: 1 });
    expect(await contarPendientes(a)).toBe(0);
    expect(remoto.filas('perfiles')[0]).toMatchObject({ nombre: 'Carla', activo: true });

    await sincronizar(b, remoto, NEGOCIO);
    expect((await listarPerfiles(b, NEGOCIO)).map((p) => p.nombre)).toEqual(['Carla']);
  });

  it('propaga ediciones y solo descarga lo nuevo', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();

    const carla = await crearPerfil(a, {
      negocioId: NEGOCIO,
      nombre: 'Carla',
      rol: 'cajero',
      pin: '1234',
    });
    await sincronizar(a, remoto, NEGOCIO);
    await sincronizar(b, remoto, NEGOCIO);

    await cambiarActivo(b, carla.id, false);
    await sincronizar(b, remoto, NEGOCIO);
    const resultado = await sincronizar(a, remoto, NEGOCIO);

    expect(resultado.descargadas).toBe(1);
    expect((await listarPerfiles(a, NEGOCIO))[0].activo).toBe(false);
    expect(await listarPerfiles(a, NEGOCIO, { soloActivos: true })).toEqual([]);
  });

  it('no pisa cambios locales pendientes con datos del servidor', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();

    const carla = await crearPerfil(a, {
      negocioId: NEGOCIO,
      nombre: 'Carla',
      rol: 'cajero',
      pin: '1234',
    });
    await sincronizar(a, remoto, NEGOCIO);

    // Otro teléfono cambia el nombre en el servidor mientras A desactiva a Carla sin conexión.
    remoto.escribir('perfiles', { ...remoto.filas('perfiles')[0], nombre: 'Carla P.' });
    await cambiarActivo(a, carla.id, false);

    remoto.fallar = true;
    await expect(sincronizar(a, remoto, NEGOCIO)).rejects.toThrow('sin conexión');
    expect(await contarPendientes(a)).toBe(1);

    remoto.fallar = false;
    await sincronizar(a, remoto, NEGOCIO);

    // Gana la última escritura: la de A, que se subió después.
    expect(remoto.filas('perfiles')[0]).toMatchObject({ activo: false });
    expect(await contarPendientes(a)).toBe(0);
  });

  it('solo descarga datos del negocio pedido', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const otro = await nuevoTelefono();

    await crearPerfil(otro, { negocioId: 'otro', nombre: 'Intruso', rol: 'cajero', pin: '0000' });
    await sincronizar(otro, remoto, 'otro');
    await sincronizar(a, remoto, NEGOCIO);

    expect(await listarPerfiles(a, 'otro')).toEqual([]);
  });
});
