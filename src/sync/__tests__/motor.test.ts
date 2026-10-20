import { migrarBaseDeDatos } from '@/db/migraciones';
import { cambiarActivo, cambiarPermisos, crearPerfil, listarPerfiles } from '@/db/perfiles';
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

describe('sincronizar permisos por persona', () => {
  const AHORA = '2026-10-19T10:00:00.000Z';
  const leerPermisos = (db: BaseLocal, id: string) =>
    db.getFirstAsync<{ permisos: string }>('SELECT permisos FROM perfiles WHERE id = ?', id);

  it('sube los permisos como arreglo (jsonb), sin rol_id, y los baja como texto JSON', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();

    const beto = await crearPerfil(a, {
      negocioId: NEGOCIO,
      nombre: 'Beto',
      rol: 'cajero',
      pin: '1234',
      permisos: ['stock', 'vender'],
    });
    await crearPerfil(a, { negocioId: NEGOCIO, nombre: 'Ana', rol: 'dueno', pin: '4321' });
    await sincronizar(a, remoto, NEGOCIO);

    const subidos = remoto.filas('perfiles');
    const subidoBeto = subidos.find((p) => p.nombre === 'Beto')!;
    expect(Array.isArray(subidoBeto.permisos)).toBe(true);
    expect(subidoBeto.permisos).toEqual(['vender', 'stock']); // en el orden del catálogo
    expect(subidoBeto).not.toHaveProperty('rol_id');
    expect(subidos.find((p) => p.nombre === 'Ana')?.permisos).toEqual([]);

    await sincronizar(b, remoto, NEGOCIO);
    const bajada = await leerPermisos(b, beto.id);
    expect(typeof bajada?.permisos).toBe('string');
    expect(JSON.parse(bajada!.permisos)).toEqual(['vender', 'stock']);
    expect((await listarPerfiles(b, NEGOCIO)).find((p) => p.nombre === 'Beto')?.permisos).toEqual([
      'vender',
      'stock',
    ]);
  });

  it('el servidor entrega permisos como arreglo y quedan legibles en la base local', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    remoto.escribir('perfiles', {
      id: 'perfil-9',
      negocio_id: NEGOCIO,
      nombre: 'Rosa',
      rol: 'cajero',
      permisos: ['vender', 'caja'],
      pin_hash: 'h',
      activo: true,
      creado_en: AHORA,
      actualizado_en: AHORA,
      eliminado: false,
    });

    await sincronizar(a, remoto, NEGOCIO);

    expect(await listarPerfiles(a, NEGOCIO)).toMatchObject([
      { id: 'perfil-9', permisos: ['vender', 'caja'], activo: true },
    ]);
  });

  it('cambiarPermisos en un equipo cambia los permisos en el otro', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const b = await nuevoTelefono();
    const beto = await crearPerfil(a, {
      negocioId: NEGOCIO,
      nombre: 'Beto',
      rol: 'cajero',
      pin: '1234',
      permisos: ['vender'],
    });
    await sincronizar(a, remoto, NEGOCIO);
    await sincronizar(b, remoto, NEGOCIO);

    await cambiarPermisos(a, beto.id, ['stock', 'reportes']);
    expect(await contarPendientes(a)).toBe(1);
    await sincronizar(a, remoto, NEGOCIO);
    await sincronizar(b, remoto, NEGOCIO);

    expect((await listarPerfiles(b, NEGOCIO))[0].permisos).toEqual(['stock', 'reportes']);
  });

  it('un cambio de permisos del servidor no pisa un cambio local pendiente', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const beto = await crearPerfil(a, {
      negocioId: NEGOCIO,
      nombre: 'Beto',
      rol: 'cajero',
      pin: '1234',
      permisos: ['vender'],
    });
    await sincronizar(a, remoto, NEGOCIO);

    remoto.escribir('perfiles', { ...remoto.filas('perfiles')[0], permisos: ['caja'] });
    await cambiarPermisos(a, beto.id, ['stock']);
    remoto.fallar = true;
    await expect(sincronizar(a, remoto, NEGOCIO)).rejects.toThrow('sin conexión');
    expect(JSON.parse((await leerPermisos(a, beto.id))!.permisos)).toEqual(['stock']);
  });

  it('la tabla roles ya no se sincroniza: ni se sube ni se baja', async () => {
    const remoto = crearRemotoFalso();
    const a = await nuevoTelefono();
    const tablas: string[] = [];
    const subirOriginal = remoto.subir;
    remoto.subir = async (tabla, filas) => {
      tablas.push(tabla);
      return subirOriginal(tabla, filas);
    };
    const descargarOriginal = remoto.descargar;
    remoto.descargar = async (tabla, negocioId, cursor) => {
      tablas.push(tabla);
      return descargarOriginal(tabla, negocioId, cursor);
    };
    // Un rol que siga en el servidor no llega a la app.
    remoto.escribir('roles', {
      id: 'rol-1',
      negocio_id: NEGOCIO,
      nombre: 'Cajero',
      permisos: ['vender'],
      predefinido: 'cajero',
      creado_en: AHORA,
      actualizado_en: AHORA,
      eliminado: false,
    });
    await crearPerfil(a, { negocioId: NEGOCIO, nombre: 'Beto', rol: 'cajero', pin: '1234' });

    await sincronizar(a, remoto, NEGOCIO);

    expect(tablas).toContain('perfiles');
    expect(tablas).not.toContain('roles');
  });
});
