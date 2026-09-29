import { listarCategorias } from '@/db/categorias';
import { migrarBaseDeDatos } from '@/db/migraciones';
import { buscarPorCodigo, listarProductos } from '@/db/productos';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

import { analizarCsv, importarProductos } from '../importar';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';
const AUTOR = { perfilId: 'perfil-1', dispositivoId: 'disp-1' };

const CSV = `Nombre;Código de barras;Categoría;Precio;Costo;Stock;Stock mínimo;Unidad
Cerveza lata 470cc;7801234567890;Cervezas;$1.290;800;24;6;unidad
Queso gauda;;Lácteos;9.990;7000;2,5;0,5;kilo
Sin precio;;;;;;;
;123;Cervezas;1000;;;;
Malo;;;abc;;;;
Rara;;;100;;;;litro`;

describe('analizarCsv', () => {
  it('reconoce columnas con tildes y mayúsculas y valida cada fila', () => {
    const { filas, errores } = analizarCsv(CSV);

    expect(filas.map((f) => f.nombre)).toEqual(['Cerveza lata 470cc', 'Queso gauda', 'Sin precio']);
    expect(filas[0]).toMatchObject({
      codigoBarras: '7801234567890',
      categoria: 'Cervezas',
      precioVenta: 1290,
      costo: 800,
      stock: 24,
      stockMinimo: 6,
      unidad: 'unidad',
    });
    expect(filas[1]).toMatchObject({ unidad: 'kg', stock: 2.5, stockMinimo: 0.5 });
    expect(errores).toEqual([
      { linea: 5, mensaje: 'Falta el nombre.' },
      { linea: 6, mensaje: 'Precio no válido: "abc".' },
      { linea: 7, mensaje: 'Unidad no válida: "litro".' },
    ]);
  });

  it('exige la columna nombre', () => {
    expect(analizarCsv('precio;costo\n1;2').errores[0].mensaje).toMatch(/nombre/);
  });
});

describe('importarProductos', () => {
  it('crea productos y categorías, y actualiza por código de barras sin duplicar', async () => {
    const db = crearBaseEnMemoria();
    await migrarBaseDeDatos(db);

    const primera = await importarProductos(db, NEGOCIO, analizarCsv(CSV).filas, AUTOR);
    expect(primera).toEqual({ creados: 3, actualizados: 0 });
    expect((await listarCategorias(db, NEGOCIO)).map((c) => c.nombre)).toEqual([
      'Cervezas',
      'Lácteos',
    ]);

    const cerveza = await buscarPorCodigo(db, NEGOCIO, '7801234567890');
    expect(cerveza).toMatchObject({ stock: 24, categoria: 'Cervezas', precioVenta: 1290 });

    // Segunda importación con precio nuevo: actualiza, no duplica ni suma stock.
    const nuevo = 'nombre;codigo_barras;precio_venta;stock\nCerveza lata;7801234567890;1390;50';
    const segunda = await importarProductos(db, NEGOCIO, analizarCsv(nuevo).filas, AUTOR);
    expect(segunda).toEqual({ creados: 0, actualizados: 1 });
    expect(await buscarPorCodigo(db, NEGOCIO, '7801234567890')).toMatchObject({
      nombre: 'Cerveza lata',
      precioVenta: 1390,
      stock: 24,
    });
    expect(await listarProductos(db, NEGOCIO)).toHaveLength(3);
  });
});
