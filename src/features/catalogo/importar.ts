import { crearCategoria } from '@/db/categorias';
import {
  actualizarProducto,
  type Autor,
  buscarPorCodigo,
  crearProducto,
  type Unidad,
} from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
import { leerCsv } from '@/lib/csv';
import { parsearCantidad, parsearMonto } from '@/lib/numeros';

export type FilaImportacion = {
  linea: number;
  nombre: string;
  codigoBarras: string | null;
  categoria: string | null;
  precioVenta: number;
  costo: number;
  stock: number;
  stockMinimo: number;
  unidad: Unidad;
};

export type Analisis = {
  filas: FilaImportacion[];
  errores: { linea: number; mensaje: string }[];
};

export const COLUMNAS_EJEMPLO =
  'nombre;codigo_barras;categoria;precio_venta;costo;stock;stock_minimo;unidad';

// Nombres de columna aceptados (sin tildes, minúsculas, espacios como "_").
const ALIAS: Record<string, keyof Omit<FilaImportacion, 'linea'>> = {
  nombre: 'nombre',
  producto: 'nombre',
  descripcion: 'nombre',
  codigo: 'codigoBarras',
  codigo_barras: 'codigoBarras',
  codigo_de_barras: 'codigoBarras',
  ean: 'codigoBarras',
  categoria: 'categoria',
  precio: 'precioVenta',
  precio_venta: 'precioVenta',
  costo: 'costo',
  precio_costo: 'costo',
  stock: 'stock',
  stock_inicial: 'stock',
  cantidad: 'stock',
  stock_minimo: 'stockMinimo',
  minimo: 'stockMinimo',
  unidad: 'unidad',
};

const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '_');

function leerUnidad(texto: string): Unidad | null {
  const valor = normalizar(texto);
  if (valor === '' || valor.startsWith('unid') || valor === 'u' || valor === 'un') return 'unidad';
  if (valor.startsWith('pack') || valor === 'caja') return 'pack';
  if (valor.startsWith('k')) return 'kg';
  return null;
}

/** Revisa el contenido de un CSV y devuelve las filas válidas y los errores por línea. */
export function analizarCsv(texto: string): Analisis {
  const [encabezado, ...datos] = leerCsv(texto);
  if (!encabezado) return { filas: [], errores: [{ linea: 1, mensaje: 'El archivo está vacío.' }] };

  const columnas = encabezado.map((c) => ALIAS[normalizar(c)]);
  if (!columnas.includes('nombre')) {
    return {
      filas: [],
      errores: [{ linea: 1, mensaje: 'Falta la columna "nombre" en la primera fila.' }],
    };
  }

  const filas: FilaImportacion[] = [];
  const errores: Analisis['errores'] = [];

  datos.forEach((valores, i) => {
    const linea = i + 2;
    const celda = (campo: keyof Omit<FilaImportacion, 'linea'>) => {
      const indice = columnas.indexOf(campo);
      return indice >= 0 ? (valores[indice] ?? '').trim() : '';
    };

    const nombre = celda('nombre');
    if (!nombre) return errores.push({ linea, mensaje: 'Falta el nombre.' });

    const numero = (campo: 'precioVenta' | 'costo', etiqueta: string) => {
      const texto = celda(campo);
      if (texto === '') return 0;
      const valor = parsearMonto(texto);
      if (valor === null) errores.push({ linea, mensaje: `${etiqueta} no válido: "${texto}".` });
      return valor;
    };
    const cantidad = (campo: 'stock' | 'stockMinimo', etiqueta: string) => {
      const texto = celda(campo);
      if (texto === '') return 0;
      const valor = parsearCantidad(texto);
      if (valor === null || valor < 0)
        errores.push({ linea, mensaje: `${etiqueta} no válido: "${texto}".` });
      return valor;
    };

    const precioVenta = numero('precioVenta', 'Precio');
    const costo = numero('costo', 'Costo');
    const stock = cantidad('stock', 'Stock');
    const stockMinimo = cantidad('stockMinimo', 'Stock mínimo');
    const unidad = leerUnidad(celda('unidad'));
    if (!unidad) errores.push({ linea, mensaje: `Unidad no válida: "${celda('unidad')}".` });

    if (
      precioVenta === null ||
      costo === null ||
      stock === null ||
      stockMinimo === null ||
      stock < 0 ||
      stockMinimo < 0 ||
      !unidad
    ) {
      return;
    }

    filas.push({
      linea,
      nombre,
      codigoBarras: celda('codigoBarras') || null,
      categoria: celda('categoria') || null,
      precioVenta,
      costo,
      stock,
      stockMinimo,
      unidad,
    });
  });

  return { filas, errores };
}

/**
 * Guarda las filas analizadas. Si el código de barras ya existe, actualiza ese
 * producto (sin tocar su stock); si no, crea uno nuevo con el stock indicado.
 */
export async function importarProductos(
  db: BaseLocal,
  negocioId: string,
  filas: FilaImportacion[],
  autor: Autor,
): Promise<{ creados: number; actualizados: number }> {
  let creados = 0;
  let actualizados = 0;
  const categorias = new Map<string, string>();

  for (const fila of filas) {
    let categoriaId: string | null = null;
    if (fila.categoria) {
      const clave = fila.categoria.toLowerCase();
      if (!categorias.has(clave)) {
        categorias.set(clave, (await crearCategoria(db, negocioId, fila.categoria)).id);
      }
      categoriaId = categorias.get(clave)!;
    }

    const datos = {
      nombre: fila.nombre,
      codigoBarras: fila.codigoBarras,
      categoriaId,
      precioVenta: fila.precioVenta,
      costo: fila.costo,
      stockMinimo: fila.stockMinimo,
      unidad: fila.unidad,
    };

    const existente = fila.codigoBarras
      ? await buscarPorCodigo(db, negocioId, fila.codigoBarras)
      : null;
    if (existente) {
      await actualizarProducto(db, existente.id, datos);
      actualizados++;
    } else {
      await crearProducto(db, negocioId, datos, fila.stock, autor);
      creados++;
    }
  }

  return { creados, actualizados };
}
