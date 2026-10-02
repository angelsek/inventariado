import { create } from 'zustand';

import { ajustarStock, type Autor } from '@/db/productos';
import type { BaseLocal } from '@/db/tipos';

export type LineaConteo = {
  productoId: string;
  nombre: string;
  unidad: 'unidad' | 'pack' | 'kg';
  /** Stock que decía la app al empezar a contar este producto. */
  stockSistema: number;
  contado: number;
};

type Conteo = {
  lineas: LineaConteo[];
  /** Suma `cantidad` a lo contado del producto (cada escaneo suma 1). */
  sumar(linea: Omit<LineaConteo, 'contado'>, cantidad: number): void;
  fijar(productoId: string, contado: number): void;
  quitar(productoId: string): void;
  vaciar(): void;
};

/** Toma de inventario en curso en este teléfono (en memoria). */
export const useConteo = create<Conteo>((set) => ({
  lineas: [],
  sumar: (linea, cantidad) =>
    set((s) => {
      const existente = s.lineas.find((l) => l.productoId === linea.productoId);
      if (existente) {
        return {
          lineas: s.lineas.map((l) =>
            l.productoId === linea.productoId
              ? { ...l, contado: redondear(l.contado + cantidad) }
              : l,
          ),
        };
      }
      return { lineas: [{ ...linea, contado: redondear(cantidad) }, ...s.lineas] };
    }),
  fijar: (productoId, contado) =>
    set((s) => ({
      lineas: s.lineas.map((l) =>
        l.productoId === productoId ? { ...l, contado: Math.max(0, redondear(contado)) } : l,
      ),
    })),
  quitar: (productoId) =>
    set((s) => ({ lineas: s.lineas.filter((l) => l.productoId !== productoId) })),
  vaciar: () => set({ lineas: [] }),
}));

const redondear = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Deja el stock de cada producto contado igual a lo contado, registrando la
 * diferencia contra el stock actual como movimiento 'conteo'. Conviene contar
 * sin vender al mismo tiempo, o el conteo pisaría esas ventas.
 */
export async function aplicarConteo(
  db: BaseLocal,
  negocioId: string,
  lineas: LineaConteo[],
  autor: Autor,
): Promise<{ ajustados: number; sinCambios: number }> {
  let ajustados = 0;
  let sinCambios = 0;
  for (const linea of lineas) {
    const diferencia = await ajustarStock(db, {
      negocioId,
      productoId: linea.productoId,
      nuevoStock: linea.contado,
      tipo: 'conteo',
      motivo: 'Toma de inventario',
      autor,
    });
    if (diferencia === 0) sinCambios++;
    else ajustados++;
  }
  return { ajustados, sinCambios };
}
