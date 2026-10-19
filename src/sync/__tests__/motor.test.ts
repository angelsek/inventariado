import { migrarBaseDeDatos } from '@/db/migraciones';
import { asignarRol, cambiarActivo, crearPerfil, listarPerfiles } from '@/db/perfiles';
import { listarRoles, obtenerRol } from '@/db/roles';
import { crearProducto, listarProductos, registrarMovimiento } from '@/db/productos';
import { anularVenta, obtenerVenta, registrarVenta } from '@/db/ventas';
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

  it('sincroniza productos y su stock (movimientos) entre teléfonos', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();
    const autor = { perfilId: 'p1', dispositivoId: 'd1' };

    const id = await crearProducto(
      a,
      NEGOCIO,
      {
        nombre: 'Queso gauda',
        codigoBarras: null,
        categoriaId: null,
        precioVenta: 9990,
        costo: 7000,
        stockMinimo: 0.5,
        unidad: 'kg',
      },
      2.5,
      autor,
    );
    await sincronizar(a, remoto, NEGOCIO);
    expect(remoto.filas('productos')[0]).toMatchObject({ activo: true, stock_minimo: 0.5 });

    await sincronizar(b, remoto, NEGOCIO);
    await registrarMovimiento(b, {
      negocioId: NEGOCIO,
      productoId: id,
      tipo: 'venta',
      cantidad: -0.75,
      autor,
    });
    await sincronizar(b, remoto, NEGOCIO);
    await sincronizar(a, remoto, NEGOCIO);

    for (const telefono of [a, b]) {
      const [producto] = await listarProductos(telefono, NEGOCIO);
      expect(producto).toMatchObject({ nombre: 'Queso gauda', unidad: 'kg', stock: 1.75 });
    }
  });

  it('una venta y su anulación llegan al otro teléfono con el stock correcto', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();
    const autor = { perfilId: 'p1', dispositivoId: 'd1' };

    const productoId = await crearProducto(
      a,
      NEGOCIO,
      {
        nombre: 'Cerveza',
        codigoBarras: null,
        categoriaId: null,
        precioVenta: 1000,
        costo: 600,
        stockMinimo: 0,
        unidad: 'unidad',
      },
      10,
      autor,
    );
    const [producto] = await listarProductos(a, NEGOCIO);
    const ventaId = await registrarVenta(a, {
      negocioId: NEGOCIO,
      items: [
        {
          clave: productoId,
          productoId,
          nombre: 'Cerveza',
          unidad: 'unidad',
          cantidad: 3,
          precioUnitario: 1000,
          costoUnitario: 600,
          descuento: 0,
          stock: producto.stock,
        },
      ],
      descuentoGeneral: 0,
      pagos: [{ medio: 'efectivo', monto: 3000 }],
      efectivoRecibido: 3000,
      vuelto: 0,
      autor,
    });
    await sincronizar(a, remoto, NEGOCIO);
    await sincronizar(b, remoto, NEGOCIO);

    expect((await listarProductos(b, NEGOCIO))[0].stock).toBe(7);
    expect(await obtenerVenta(b, ventaId)).toMatchObject({ total: 3000, estado: 'completada' });

    await anularVenta(b, ventaId, 'Error', autor);
    await sincronizar(b, remoto, NEGOCIO);
    await sincronizar(a, remoto, NEGOCIO);

    expect(await obtenerVenta(a, ventaId)).toMatchObject({
      estado: 'anulada',
      motivoAnulacion: 'Error',
    });
    expect((await listarProductos(a, NEGOCIO))[0].stock).toBe(10);
  });
});

describe('sincronizar roles y permisos', () => {
  const AHORA = '2026-10-19T10:00:00.000Z';
  const insertarRol = (db: BaseLocal, id: string, permisos: string, pendiente = 1) =>
    db.runAsync(
      `INSERT INTO roles (id, negocio_id, nombre, permisos, predefinido, creado_en, actualizado_en, pendiente)
       VALUES (?, ?, 'Auxiliar', ?, NULL, ?, ?, ?)`,
      id,
      NEGOCIO,
      permisos,
      AHORA,
      AHORA,
      pendiente,
    );
  const leerPermisos = (db: BaseLocal, id: string) =>
    db.getFirstAsync<{ permisos: string }>('SELECT permisos FROM roles WHERE id = ?', id);

  it('sube los permisos como arreglo (jsonb) y los baja guardados como texto JSON', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();

    await insertarRol(a, 'rol-1', '["stock","vender"]');
    await sincronizar(a, remoto, NEGOCIO);

    const [subida] = remoto.filas('roles');
    expect(Array.isArray(subida.permisos)).toBe(true);
    expect(subida.permisos).toEqual(['stock', 'vender']);
    expect(subida).toMatchObject({ nombre: 'Auxiliar', eliminado: false });

    await sincronizar(b, remoto, NEGOCIO);
    const bajada = await leerPermisos(b, 'rol-1');
    expect(typeof bajada?.permisos).toBe('string');
    expect(JSON.parse(bajada!.permisos)).toEqual(['stock', 'vender']);
  });

  it('el servidor entrega permisos como arreglo y quedan legibles en la base local', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    remoto.escribir('roles', {
      id: 'rol-9',
      negocio_id: NEGOCIO,
      nombre: 'Cajero',
      permisos: ['vender', 'caja'],
      predefinido: 'cajero',
      creado_en: AHORA,
      actualizado_en: AHORA,
      eliminado: false,
    });

    await sincronizar(a, remoto, NEGOCIO);

    expect(await listarRoles(a, NEGOCIO)).toMatchObject([
      { id: 'rol-9', predefinido: 'cajero', permisos: ['vender', 'caja'], eliminado: false },
    ]);
  });

  it('un rol eliminado en otro equipo llega marcado como eliminado', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();
    await insertarRol(a, 'rol-1', '[]');
    await sincronizar(a, remoto, NEGOCIO);
    await sincronizar(b, remoto, NEGOCIO);

    remoto.escribir('roles', { ...remoto.filas('roles')[0], eliminado: true });
    await sincronizar(b, remoto, NEGOCIO);

    expect(await listarRoles(b, NEGOCIO)).toEqual([]);
    expect(await obtenerRol(b, 'rol-1')).toMatchObject({ eliminado: true });
  });

  it('un cambio de permisos del servidor no pisa un cambio local pendiente', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    await insertarRol(a, 'rol-1', '["vender"]');
    await sincronizar(a, remoto, NEGOCIO);

    remoto.escribir('roles', { ...remoto.filas('roles')[0], permisos: ['caja'] });
    await a.runAsync(
      `UPDATE roles SET permisos = '["stock"]', pendiente = pendiente + 1 WHERE id = 'rol-1'`,
    );
    remoto.fallar = true;
    await expect(sincronizar(a, remoto, NEGOCIO)).rejects.toThrow('sin conexión');
    expect(JSON.parse((await leerPermisos(a, 'rol-1'))!.permisos)).toEqual(['stock']);
  });

  it('roles se sube antes que perfiles y rol_id viaja al servidor y de vuelta', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();
    const orden: string[] = [];
    const subirOriginal = remoto.subir;
    remoto.subir = async (tabla, filas) => {
      orden.push(tabla);
      return subirOriginal(tabla, filas);
    };

    await insertarRol(a, 'rol-1', '["stock"]');
    await crearPerfil(a, {
      negocioId: NEGOCIO,
      nombre: 'Beto',
      rol: 'cajero',
      pin: '1234',
      rolId: 'rol-1',
    });
    await crearPerfil(a, { negocioId: NEGOCIO, nombre: 'Ana', rol: 'dueno', pin: '4321' });
    await sincronizar(a, remoto, NEGOCIO);

    expect(orden.indexOf('roles')).toBeGreaterThanOrEqual(0);
    expect(orden.indexOf('roles')).toBeLessThan(orden.indexOf('perfiles'));
    const subidos = remoto.filas('perfiles');
    expect(subidos.find((p) => p.nombre === 'Beto')).toMatchObject({ rol_id: 'rol-1' });
    expect(subidos.find((p) => p.nombre === 'Ana')).toMatchObject({ rol_id: null });

    await sincronizar(b, remoto, NEGOCIO);
    const perfiles = await listarPerfiles(b, NEGOCIO);
    expect(perfiles.find((p) => p.nombre === 'Beto')?.rol_id).toBe('rol-1');
    expect(perfiles.find((p) => p.nombre === 'Ana')?.rol_id).toBeNull();
  });

  it('asignarRol en un equipo cambia el rol en el otro', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();
    await insertarRol(a, 'rol-1', '["vender"]');
    await insertarRol(a, 'rol-2', '["stock"]');
    const beto = await crearPerfil(a, {
      negocioId: NEGOCIO,
      nombre: 'Beto',
      rol: 'cajero',
      pin: '1234',
      rolId: 'rol-1',
    });
    await sincronizar(a, remoto, NEGOCIO);
    await sincronizar(b, remoto, NEGOCIO);

    await asignarRol(a, beto.id, 'rol-2');
    expect(await contarPendientes(a)).toBe(1);
    await sincronizar(a, remoto, NEGOCIO);
    await sincronizar(b, remoto, NEGOCIO);

    expect((await listarPerfiles(b, NEGOCIO))[0].rol_id).toBe('rol-2');
  });
});
