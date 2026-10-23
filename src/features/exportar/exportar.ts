import { listarProductos } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';
import { TABLAS_SYNC } from '@/sync/tablas';

/**
 * Caracteres con los que Excel y LibreOffice empiezan una fórmula. Si una celda
 * parte con uno de ellos, la planilla la evalúa al abrir el archivo: un producto
 * llamado `=HYPERLINK("http://...";"ver")` se convierte en un enlace dentro de la
 * planilla del dueño, y otras fórmulas alcanzan a filtrar datos del archivo. Por
 * eso esta regla no se borra. El tabulador y el salto de línea van en la lista
 * porque algunas planillas los saltan y evalúan el carácter que sigue.
 */
const INICIO_DE_FORMULA = /^[=+\-@\t\r\n]/;

/** Un número escrito como en la planilla (coma o punto decimal), negativo incluido. */
const SOLO_NUMERO = /^-?\d+(?:[.,]\d+)?$/;

/**
 * Escapa un valor para CSV con ";" (formato que abre Excel en Chile) y le antepone
 * un apóstrofo si empieza como una fórmula, para que quede como texto. Los números
 * (precios, costos, stock, montos, cantidades, ganancias) nunca se tocan: un monto
 * negativo tiene que seguir siendo número en la planilla o se rompen las sumas del
 * dueño. "Importar productos" le quita ese apóstrofo (src/features/catalogo/importar.ts),
 * así el CSV del catálogo sigue siendo de ida y vuelta.
 */
function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const esNumero = typeof valor === 'number';
  let texto = esNumero ? String(valor).replace('.', ',') : String(valor);
  if (!esNumero && INICIO_DE_FORMULA.test(texto) && !SOLO_NUMERO.test(texto)) {
    texto = `'${texto}`;
  }
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** CSV con BOM (para que Excel muestre bien las tildes). */
export function armarCsv(encabezado: string[], filas: unknown[][]): string {
  return '﻿' + [encabezado, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';
}

/** Catálogo en el mismo formato que acepta "Importar productos". */
export async function csvProductos(db: BaseLocal, negocioId: string): Promise<string> {
  const productos = await listarProductos(db, negocioId, { incluirInactivos: true });
  return armarCsv(
    [
      'nombre',
      'codigo_barras',
      'categoria',
      'precio_venta',
      'costo',
      'stock',
      'stock_minimo',
      'unidad',
      'activo',
    ],
    productos.map((p) => [
      p.nombre,
      p.codigoBarras,
      p.categoria,
      p.precioVenta,
      p.costo,
      p.stock,
      p.stockMinimo,
      p.unidad,
      p.activo ? 'si' : 'no',
    ]),
  );
}

/** Una fila por producto vendido entre dos fechas (ISO), para analizar en Excel. */
export async function csvVentas(
  db: BaseLocal,
  negocioId: string,
  desde: string,
  hasta: string,
): Promise<string> {
  const filas = await db.getAllAsync<{
    creado_en: string;
    venta_id: string;
    estado: string;
    vendedor: string | null;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    costo_unitario: number;
    descuento: number;
    total: number;
  }>(
    `SELECT v.creado_en, v.id AS venta_id, v.estado, p.nombre AS vendedor, i.nombre, i.cantidad,
            i.precio_unitario, i.costo_unitario, i.descuento, i.total
       FROM venta_items i
       JOIN ventas v ON v.id = i.venta_id
       LEFT JOIN perfiles p ON p.id = v.perfil_id
      WHERE v.negocio_id = ? AND v.eliminado = 0 AND i.eliminado = 0
        AND v.creado_en >= ? AND v.creado_en < ?
      ORDER BY v.creado_en, i.rowid`,
    negocioId,
    desde,
    hasta,
  );
  const dos = (n: number) => String(n).padStart(2, '0');
  return armarCsv(
    [
      'fecha',
      'hora',
      'venta',
      'estado',
      'vendedor',
      'producto',
      'cantidad',
      'precio',
      'costo',
      'descuento',
      'total',
    ],
    filas.map((f) => {
      const fecha = new Date(f.creado_en);
      return [
        `${dos(fecha.getDate())}-${dos(fecha.getMonth() + 1)}-${fecha.getFullYear()}`,
        `${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`,
        f.venta_id.replace(/-/g, '').slice(0, 6).toUpperCase(),
        f.estado,
        f.vendedor,
        f.nombre,
        f.cantidad,
        f.precio_unitario,
        f.costo_unitario,
        f.descuento,
        f.total,
      ];
    }),
  );
}

/** Todos los datos del negocio guardados en el teléfono, en JSON (sin los PIN). */
export async function respaldoJson(db: BaseLocal, negocioId: string): Promise<string> {
  const datos: Record<string, unknown[]> = {};
  for (const tabla of TABLAS_SYNC) {
    const columnas = tabla.columnas.filter((c) => c !== 'pin_hash');
    const filtro = tabla.nombre === 'negocios' ? 'id' : 'negocio_id';
    datos[tabla.nombre] = await db.getAllAsync(
      `SELECT ${columnas.join(', ')} FROM ${tabla.nombre} WHERE ${filtro} = ?`,
      negocioId,
    );
  }
  return JSON.stringify(
    { app: 'Stockeao', exportado_en: new Date().toISOString(), datos },
    null,
    1,
  );
}
