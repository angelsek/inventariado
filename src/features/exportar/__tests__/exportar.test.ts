import { migrarBaseDeDatos } from '@/db/migraciones';
import { crearPerfil } from '@/db/perfiles';
import { crearProducto, obtenerProducto } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
import { registrarVenta } from '@/db/ventas';
import { analizarCsv } from '@/features/catalogo/importar';
import { rangoDelDia } from '@/lib/fechas';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';

import { armarCsv, csvProductos, csvVentas, respaldoJson } from '../exportar';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const NEGOCIO = 'negocio-1';
const AUTOR = { perfilId: null, dispositivoId: null };
let db: BaseLocal;

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
});

it('escapa separadores, comillas y usa coma decimal', () => {
  expect(armarCsv(['a', 'b'], [['Vino "Reserva"; 750cc', 2.5]])).toBe(
    '﻿a;b\r\n"Vino ""Reserva""; 750cc";2,5\r\n',
  );
});

it('el CSV de productos se puede volver a importar tal cual', async () => {
  await crearProducto(
    db,
    NEGOCIO,
    {
      nombre: 'Queso gauda',
      codigoBarras: '780222',
      categoriaId: null,
      precioVenta: 9990,
      costo: 7000,
      stockMinimo: 0.5,
      unidad: 'kg',
    },
    2.5,
    AUTOR,
  );
  const { filas, errores } = analizarCsv(await csvProductos(db, NEGOCIO));
  expect(errores).toEqual([]);
  expect(filas[0]).toMatchObject({
    nombre: 'Queso gauda',
    codigoBarras: '780222',
    precioVenta: 9990,
    costo: 7000,
    stock: 2.5,
    stockMinimo: 0.5,
    unidad: 'kg',
  });
});

it('exporta ventas por ítem y el respaldo sin PIN', async () => {
  const perfil = await crearPerfil(db, {
    negocioId: NEGOCIO,
    nombre: 'Carla',
    rol: 'cajero',
    pin: '1234',
  });
  const id = await crearProducto(
    db,
    NEGOCIO,
    {
      nombre: 'Cerveza',
      codigoBarras: null,
      categoriaId: null,
      precioVenta: 1290,
      costo: 800,
      stockMinimo: 0,
      unidad: 'unidad',
    },
    10,
    AUTOR,
  );
  const cerveza = (await obtenerProducto(db, id))!;
  await registrarVenta(db, {
    negocioId: NEGOCIO,
    items: [
      {
        clave: id,
        productoId: id,
        nombre: cerveza.nombre,
        unidad: 'unidad',
        cantidad: 2,
        precioUnitario: 1290,
        costoUnitario: 800,
        descuento: 0,
        stock: 10,
      },
    ],
    descuentoGeneral: 0,
    pagos: [{ medio: 'efectivo', monto: 2580 }],
    efectivoRecibido: 2580,
    vuelto: 0,
    autor: { perfilId: perfil.id, dispositivoId: null },
  });

  const hoy = rangoDelDia(new Date());
  const lineas = (await csvVentas(db, NEGOCIO, hoy.desde, hoy.hasta)).trim().split('\r\n');
  expect(lineas).toHaveLength(2);
  expect(lineas[1]).toMatch(/;completada;Carla;Cerveza;2;1290;800;0;2580$/);

  const respaldo = JSON.parse(await respaldoJson(db, NEGOCIO));
  expect(respaldo.datos.productos).toHaveLength(1);
  expect(respaldo.datos.ventas).toHaveLength(1);
  expect(respaldo.datos.perfiles[0]).not.toHaveProperty('pin_hash');
});
