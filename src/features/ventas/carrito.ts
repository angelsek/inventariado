import { create } from 'zustand';

import type { Producto } from '@/db/productos';

import type { ItemCarrito } from './calculos';

type Carrito = {
  items: ItemCarrito[];
  descuentoGeneral: number;
  /** Suma `cantidad` al producto si ya está en el carrito; si no, lo agrega. */
  agregarProducto(producto: Producto, cantidad?: number): void;
  agregarMontoLibre(nombre: string, monto: number): void;
  cambiarCantidad(clave: string, cantidad: number): void;
  cambiarDescuentoItem(clave: string, descuento: number): void;
  quitar(clave: string): void;
  cambiarDescuentoGeneral(descuento: number): void;
  vaciar(): void;
};

let contadorLibre = 0;

/** Carrito de la venta en curso. Vive en memoria: se pierde si se cierra la app. */
export const useCarrito = create<Carrito>((set) => ({
  items: [],
  descuentoGeneral: 0,

  agregarProducto: (producto, cantidad = 1) =>
    set((s) => {
      const existente = s.items.find((i) => i.productoId === producto.id);
      if (existente) {
        return {
          items: s.items.map((i) =>
            i.clave === existente.clave ? { ...i, cantidad: redondear(i.cantidad + cantidad) } : i,
          ),
        };
      }
      const item: ItemCarrito = {
        clave: producto.id,
        productoId: producto.id,
        nombre: producto.nombre,
        unidad: producto.unidad,
        cantidad,
        precioUnitario: producto.precioVenta,
        costoUnitario: producto.costo,
        descuento: 0,
        stock: producto.stock,
      };
      return { items: [...s.items, item] };
    }),

  agregarMontoLibre: (nombre, monto) =>
    set((s) => ({
      items: [
        ...s.items,
        {
          clave: `libre-${++contadorLibre}`,
          productoId: null,
          nombre: nombre.trim() || 'Varios',
          unidad: 'unidad',
          cantidad: 1,
          precioUnitario: monto,
          costoUnitario: 0,
          descuento: 0,
          stock: null,
        },
      ],
    })),

  cambiarCantidad: (clave, cantidad) =>
    set((s) => ({
      items:
        cantidad <= 0
          ? s.items.filter((i) => i.clave !== clave)
          : s.items.map((i) => (i.clave === clave ? { ...i, cantidad: redondear(cantidad) } : i)),
    })),

  cambiarDescuentoItem: (clave, descuento) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.clave === clave ? { ...i, descuento: Math.max(0, Math.round(descuento)) } : i,
      ),
    })),

  quitar: (clave) => set((s) => ({ items: s.items.filter((i) => i.clave !== clave) })),

  cambiarDescuentoGeneral: (descuento) =>
    set({ descuentoGeneral: Math.max(0, Math.round(descuento)) }),

  vaciar: () => set({ items: [], descuentoGeneral: 0 }),
}));

// Evita errores de coma flotante al sumar kilos (0.1 + 0.2).
const redondear = (n: number) => Math.round(n * 1000) / 1000;
