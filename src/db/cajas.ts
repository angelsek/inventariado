import { randomUUID } from 'expo-crypto';

import { type MedioPago, porMedioVacio } from '@/features/ventas/calculos';

import type { Autor } from './productos';
import type { BaseLocal } from './tipos';

export type Caja = {
  id: string;
  abiertaEn: string;
  abiertaPor: string | null;
  montoInicial: number;
  cerradaEn: string | null;
  cerradaPor: string | null;
  efectivoEsperado: number | null;
  montoContado: number | null;
  notas: string | null;
};

export type ResumenCaja = {
  montoInicial: number;
  cantidadVentas: number;
  totalVentas: number;
  porMedio: Record<MedioPago, number>;
  ingresos: number;
  retiros: number;
  /** Efectivo que debería haber en la caja: inicial + ventas en efectivo + ingresos − retiros. */
  efectivoEsperado: number;
};

export type MovimientoCaja = {
  id: string;
  tipo: 'ingreso' | 'retiro';
  monto: number;
  motivo: string | null;
  perfil: string | null;
  creadoEn: string;
};

type FilaCaja = {
  id: string;
  abierta_en: string;
  abierta_por: string | null;
  monto_inicial: number;
  cerrada_en: string | null;
  cerrada_por: string | null;
  efectivo_esperado: number | null;
  monto_contado: number | null;
  notas: string | null;
};

const SELECT_CAJA = `
  SELECT c.id, c.abierta_en, a.nombre AS abierta_por, c.monto_inicial, c.cerrada_en,
         z.nombre AS cerrada_por, c.efectivo_esperado, c.monto_contado, c.notas
    FROM cajas c
    LEFT JOIN perfiles a ON a.id = c.abierta_por
    LEFT JOIN perfiles z ON z.id = c.cerrada_por`;

const aCaja = (f: FilaCaja): Caja => ({
  id: f.id,
  abiertaEn: f.abierta_en,
  abiertaPor: f.abierta_por,
  montoInicial: f.monto_inicial,
  cerradaEn: f.cerrada_en,
  cerradaPor: f.cerrada_por,
  efectivoEsperado: f.efectivo_esperado,
  montoContado: f.monto_contado,
  notas: f.notas,
});

/** Caja abierta en este teléfono, si hay. */
export async function obtenerCajaAbierta(
  db: BaseLocal,
  negocioId: string,
  dispositivoId: string | null,
): Promise<Caja | null> {
  const fila = await db.getFirstAsync<FilaCaja>(
    `${SELECT_CAJA}
      WHERE c.negocio_id = ? AND c.dispositivo_id IS ? AND c.cerrada_en IS NULL AND c.eliminado = 0
      ORDER BY c.abierta_en DESC LIMIT 1`,
    negocioId,
    dispositivoId,
  );
  return fila ? aCaja(fila) : null;
}

export async function obtenerCaja(db: BaseLocal, id: string): Promise<Caja | null> {
  const fila = await db.getFirstAsync<FilaCaja>(`${SELECT_CAJA} WHERE c.id = ?`, id);
  return fila ? aCaja(fila) : null;
}

export async function abrirCaja(
  db: BaseLocal,
  negocioId: string,
  montoInicial: number,
  autor: Autor,
): Promise<string> {
  const existente = await obtenerCajaAbierta(db, negocioId, autor.dispositivoId);
  if (existente) return existente.id;

  const id = randomUUID();
  const ahora = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO cajas (id, negocio_id, dispositivo_id, abierta_por, abierta_en, monto_inicial,
       creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    id,
    negocioId,
    autor.dispositivoId,
    autor.perfilId,
    ahora,
    Math.max(0, Math.round(montoInicial)),
    ahora,
    ahora,
  );
  return id;
}

export async function registrarMovimientoCaja(
  db: BaseLocal,
  datos: {
    negocioId: string;
    cajaId: string;
    tipo: 'ingreso' | 'retiro';
    monto: number;
    motivo: string;
    autor: Autor;
  },
): Promise<void> {
  if (datos.monto <= 0) throw new Error('El monto debe ser mayor que cero.');
  const ahora = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO movimientos_caja (id, negocio_id, caja_id, tipo, monto, motivo, perfil_id,
       creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    randomUUID(),
    datos.negocioId,
    datos.cajaId,
    datos.tipo,
    Math.round(datos.monto),
    datos.motivo.trim() || null,
    datos.autor.perfilId,
    ahora,
    ahora,
  );
}

export async function listarMovimientosCaja(
  db: BaseLocal,
  cajaId: string,
): Promise<MovimientoCaja[]> {
  const filas = await db.getAllAsync<{
    id: string;
    tipo: 'ingreso' | 'retiro';
    monto: number;
    motivo: string | null;
    perfil: string | null;
    creado_en: string;
  }>(
    `SELECT m.id, m.tipo, m.monto, m.motivo, p.nombre AS perfil, m.creado_en
       FROM movimientos_caja m LEFT JOIN perfiles p ON p.id = m.perfil_id
      WHERE m.caja_id = ? AND m.eliminado = 0 ORDER BY m.creado_en`,
    cajaId,
  );
  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    monto: f.monto,
    motivo: f.motivo,
    perfil: f.perfil,
    creadoEn: f.creado_en,
  }));
}

/** Totales de la caja con las ventas completadas ligadas a ella. */
export async function resumirCaja(db: BaseLocal, cajaId: string): Promise<ResumenCaja> {
  const caja = await db.getFirstAsync<{ monto_inicial: number }>(
    'SELECT monto_inicial FROM cajas WHERE id = ?',
    cajaId,
  );
  const ventas = await db.getFirstAsync<{ cantidad: number; total: number | null }>(
    `SELECT COUNT(*) AS cantidad, SUM(total) AS total FROM ventas
      WHERE caja_id = ? AND estado = 'completada' AND eliminado = 0`,
    cajaId,
  );
  const medios = await db.getAllAsync<{ medio: MedioPago; monto: number }>(
    `SELECT g.medio, SUM(g.monto) AS monto FROM pagos g JOIN ventas v ON v.id = g.venta_id
      WHERE v.caja_id = ? AND v.estado = 'completada' AND v.eliminado = 0 AND g.eliminado = 0
      GROUP BY g.medio`,
    cajaId,
  );
  const movimientos = await db.getFirstAsync<{ ingresos: number | null; retiros: number | null }>(
    `SELECT SUM(CASE WHEN tipo = 'ingreso' THEN monto END) AS ingresos,
            SUM(CASE WHEN tipo = 'retiro' THEN monto END) AS retiros
       FROM movimientos_caja WHERE caja_id = ? AND eliminado = 0`,
    cajaId,
  );

  const porMedio = porMedioVacio();
  for (const m of medios) porMedio[m.medio] = m.monto;
  const montoInicial = caja?.monto_inicial ?? 0;
  const ingresos = movimientos?.ingresos ?? 0;
  const retiros = movimientos?.retiros ?? 0;

  return {
    montoInicial,
    cantidadVentas: ventas?.cantidad ?? 0,
    totalVentas: ventas?.total ?? 0,
    porMedio,
    ingresos,
    retiros,
    efectivoEsperado: montoInicial + porMedio.efectivo + ingresos - retiros,
  };
}

/** Cierra la caja guardando el efectivo esperado y el contado. Devuelve la diferencia. */
export async function cerrarCaja(
  db: BaseLocal,
  cajaId: string,
  montoContado: number,
  notas: string,
  autor: Autor,
): Promise<number> {
  const { efectivoEsperado } = await resumirCaja(db, cajaId);
  const ahora = new Date().toISOString();
  await db.runAsync(
    `UPDATE cajas SET cerrada_en = ?, cerrada_por = ?, efectivo_esperado = ?, monto_contado = ?,
       notas = ?, actualizado_en = ?, pendiente = pendiente + 1
     WHERE id = ? AND cerrada_en IS NULL`,
    ahora,
    autor.perfilId,
    efectivoEsperado,
    Math.round(montoContado),
    notas.trim() || null,
    ahora,
    cajaId,
  );
  return Math.round(montoContado) - efectivoEsperado;
}

/** Cajas cerradas del negocio (todos los teléfonos), de la más reciente a la más antigua. */
export async function listarCajasCerradas(
  db: BaseLocal,
  negocioId: string,
  limite = 30,
): Promise<Caja[]> {
  const filas = await db.getAllAsync<FilaCaja>(
    `${SELECT_CAJA}
      WHERE c.negocio_id = ? AND c.cerrada_en IS NOT NULL AND c.eliminado = 0
      ORDER BY c.cerrada_en DESC LIMIT ?`,
    negocioId,
    limite,
  );
  return filas.map(aCaja);
}
