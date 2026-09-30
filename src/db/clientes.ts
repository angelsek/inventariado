import { randomUUID } from 'expo-crypto';

import type { MedioPago } from '@/features/ventas/calculos';
import { formatearCLP } from '@/lib/formato';

import { registrarMovimientoCaja } from './cajas';
import type { Autor } from './productos';
import type { BaseLocal } from './tipos';

/**
 * Fiado: cada cliente tiene movimientos que suman o restan a su deuda.
 *   cargo      venta fiada (suma)
 *   abono      el cliente paga (resta)
 *   anulacion  se anuló una venta fiada (resta)
 */
export type TipoMovimientoCliente = 'cargo' | 'abono' | 'anulacion';

export type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  /** Deuda máxima permitida; 0 = sin límite. */
  limiteCredito: number;
  activo: boolean;
  /** Lo que debe hoy. */
  saldo: number;
  ultimoMovimiento: string | null;
};

export type MovimientoCliente = {
  id: string;
  tipo: TipoMovimientoCliente;
  monto: number;
  ventaId: string | null;
  medio: MedioPago | null;
  notas: string | null;
  perfil: string | null;
  creadoEn: string;
};

type FilaCliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  limite_credito: number | null;
  activo: number;
  saldo: number | null;
  ultimo: string | null;
};

const SELECT_CLIENTE = `
  SELECT c.id, c.nombre, c.telefono, c.limite_credito, c.activo,
         (SELECT SUM(CASE m.tipo WHEN 'cargo' THEN m.monto ELSE -m.monto END)
            FROM movimientos_cliente m WHERE m.cliente_id = c.id AND m.eliminado = 0) AS saldo,
         (SELECT MAX(m.creado_en) FROM movimientos_cliente m
           WHERE m.cliente_id = c.id AND m.eliminado = 0) AS ultimo
    FROM clientes c`;

const aCliente = (f: FilaCliente): Cliente => ({
  id: f.id,
  nombre: f.nombre,
  telefono: f.telefono,
  limiteCredito: f.limite_credito ?? 0,
  activo: f.activo === 1,
  saldo: f.saldo ?? 0,
  ultimoMovimiento: f.ultimo,
});

/** Clientes del negocio: primero los que deben más. */
export async function listarClientes(
  db: BaseLocal,
  negocioId: string,
  filtro: { busqueda?: string; incluirInactivos?: boolean } = {},
): Promise<Cliente[]> {
  const condiciones = ['c.negocio_id = ?', 'c.eliminado = 0'];
  const params: string[] = [negocioId];
  if (!filtro.incluirInactivos) condiciones.push('c.activo = 1');
  const busqueda = filtro.busqueda?.trim();
  if (busqueda) {
    condiciones.push('(c.nombre LIKE ? OR c.telefono LIKE ?)');
    params.push(`%${busqueda}%`, `%${busqueda}%`);
  }
  const filas = await db.getAllAsync<FilaCliente>(
    `${SELECT_CLIENTE} WHERE ${condiciones.join(' AND ')}
      ORDER BY COALESCE(saldo, 0) DESC, c.nombre COLLATE NOCASE`,
    params,
  );
  return filas.map(aCliente);
}

export async function obtenerCliente(db: BaseLocal, id: string): Promise<Cliente | null> {
  const fila = await db.getFirstAsync<FilaCliente>(
    `${SELECT_CLIENTE} WHERE c.id = ? AND c.eliminado = 0`,
    id,
  );
  return fila ? aCliente(fila) : null;
}

export type DatosCliente = { nombre: string; telefono: string | null; limiteCredito: number };

export async function crearCliente(
  db: BaseLocal,
  negocioId: string,
  datos: DatosCliente,
): Promise<string> {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error('Ingresa el nombre del cliente.');
  const id = randomUUID();
  const ahora = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO clientes (id, negocio_id, nombre, telefono, limite_credito, activo,
       creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1)`,
    id,
    negocioId,
    nombre,
    datos.telefono?.trim() || null,
    datos.limiteCredito > 0 ? Math.round(datos.limiteCredito) : null,
    ahora,
    ahora,
  );
  return id;
}

export async function actualizarCliente(
  db: BaseLocal,
  id: string,
  datos: DatosCliente & { activo: boolean },
): Promise<void> {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error('Ingresa el nombre del cliente.');
  await db.runAsync(
    `UPDATE clientes SET nombre = ?, telefono = ?, limite_credito = ?, activo = ?,
       actualizado_en = ?, pendiente = pendiente + 1
     WHERE id = ?`,
    nombre,
    datos.telefono?.trim() || null,
    datos.limiteCredito > 0 ? Math.round(datos.limiteCredito) : null,
    datos.activo ? 1 : 0,
    new Date().toISOString(),
    id,
  );
}

/**
 * Revisa si se le puede fiar `monto` al cliente sin pasar su límite.
 * Devuelve el mensaje de error, o null si se puede.
 */
export function revisarLimite(cliente: Cliente, monto: number): string | null {
  if (cliente.limiteCredito <= 0) return null;
  const disponible = cliente.limiteCredito - cliente.saldo;
  if (monto <= disponible) return null;
  const pesos = (n: number) => formatearCLP(Math.max(0, n));
  return `${cliente.nombre} tiene un límite de ${pesos(cliente.limiteCredito)} y debe ${pesos(cliente.saldo)}: solo se le pueden fiar ${pesos(disponible)} más.`;
}

export async function listarMovimientosCliente(
  db: BaseLocal,
  clienteId: string,
  limite = 100,
): Promise<MovimientoCliente[]> {
  const filas = await db.getAllAsync<{
    id: string;
    tipo: TipoMovimientoCliente;
    monto: number;
    venta_id: string | null;
    medio: MedioPago | null;
    notas: string | null;
    perfil: string | null;
    creado_en: string;
  }>(
    `SELECT m.id, m.tipo, m.monto, m.venta_id, m.medio, m.notas, p.nombre AS perfil, m.creado_en
       FROM movimientos_cliente m LEFT JOIN perfiles p ON p.id = m.perfil_id
      WHERE m.cliente_id = ? AND m.eliminado = 0
      ORDER BY m.creado_en DESC, m.rowid DESC LIMIT ?`,
    clienteId,
    limite,
  );
  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    monto: f.monto,
    ventaId: f.venta_id,
    medio: f.medio,
    notas: f.notas,
    perfil: f.perfil,
    creadoEn: f.creado_en,
  }));
}

/**
 * El cliente paga parte o todo lo que debe. Si paga en efectivo y el teléfono
 * tiene la caja abierta, el dinero también entra a la caja.
 */
export async function registrarAbono(
  db: BaseLocal,
  datos: {
    negocioId: string;
    clienteId: string;
    monto: number;
    medio: Exclude<MedioPago, 'fiado'>;
    notas?: string | null;
    cajaId?: string | null;
    autor: Autor;
  },
): Promise<void> {
  const monto = Math.round(datos.monto);
  if (monto <= 0) throw new Error('El monto debe ser mayor que cero.');
  const cliente = await obtenerCliente(db, datos.clienteId);
  if (!cliente) throw new Error('Cliente no encontrado.');
  await db.withTransactionAsync(async () => {
    await insertarMovimientoCliente(db, {
      negocioId: datos.negocioId,
      clienteId: datos.clienteId,
      tipo: 'abono',
      monto,
      medio: datos.medio,
      notas: datos.notas ?? null,
      autor: datos.autor,
      fecha: new Date().toISOString(),
    });
    if (datos.medio === 'efectivo' && datos.cajaId) {
      await registrarMovimientoCaja(db, {
        negocioId: datos.negocioId,
        cajaId: datos.cajaId,
        tipo: 'ingreso',
        monto,
        motivo: `Pago de fiado: ${cliente.nombre}`,
        autor: datos.autor,
      });
    }
  });
}

/** Deuda total de todos los clientes del negocio. */
export async function totalFiado(db: BaseLocal, negocioId: string): Promise<number> {
  const fila = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(CASE tipo WHEN 'cargo' THEN monto ELSE -monto END) AS total
       FROM movimientos_cliente WHERE negocio_id = ? AND eliminado = 0`,
    negocioId,
  );
  return fila?.total ?? 0;
}

/** Usado por ventas.ts dentro de su transacción. */
export async function insertarMovimientoCliente(
  db: BaseLocal,
  datos: {
    negocioId: string;
    clienteId: string;
    tipo: TipoMovimientoCliente;
    monto: number;
    ventaId?: string | null;
    medio?: MedioPago | null;
    notas?: string | null;
    autor: Autor;
    fecha: string;
  },
): Promise<void> {
  await db.runAsync(
    `INSERT INTO movimientos_cliente (id, negocio_id, cliente_id, tipo, monto, venta_id, medio,
       notas, perfil_id, dispositivo_id, creado_en, actualizado_en, pendiente)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    randomUUID(),
    datos.negocioId,
    datos.clienteId,
    datos.tipo,
    datos.monto,
    datos.ventaId ?? null,
    datos.medio ?? null,
    datos.notas?.trim() || null,
    datos.autor.perfilId,
    datos.autor.dispositivoId,
    datos.fecha,
    datos.fecha,
  );
}
