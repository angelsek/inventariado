import { create } from 'zustand';

import type { Producto } from '@/db/productos';

import type { ItemCarrito } from './calculos';

type Carrito = {
  items: ItemCarrito[];
  descuentoGeneral: number;
  /** Suma `cantidad` al producto si ya está en el carrito; si no, lo agrega. */
  agregarProducto(producto: Producto, cantidad?: number): void;
  agregarMontoLibre(nombre: string, monto: number): void;
  /**
   * Agrega (o quita) la línea que cobra los envases de un producto retornable,
   * para cuando el cliente no trae el envase vacío.
   */
  alternarEnvase(clave: string): void;
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
        // Las promos por cantidad son para productos por unidad (no por kilo).
        promo:
          producto.promoCantidad && producto.promoPrecio !== null && producto.unidad !== 'kg'
            ? { cantidad: producto.promoCantidad, precio: producto.promoPrecio }
            : null,
        precioEnvase: producto.precioEnvase,
        alcohol: producto.alcohol,
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

  alternarEnvase: (clave) =>
    set((s) => {
      const claveEnvase = `envase-${clave}`;
      if (s.items.some((i) => i.clave === claveEnvase)) {
        return { items: s.items.filter((i) => i.clave !== claveEnvase) };
      }
      const item = s.items.find((i) => i.clave === clave);
      if (!item?.precioEnvase) return {};
      const envase: ItemCarrito = {
        clave: claveEnvase,
        productoId: null,
        nombre: `Envase ${item.nombre}`,
        unidad: 'unidad',
        cantidad: Math.ceil(item.cantidad),
        precioUnitario: item.precioEnvase,
        costoUnitario: 0,
        descuento: 0,
        stock: null,
      };
      const indice = s.items.indexOf(item);
      return { items: [...s.items.slice(0, indice + 1), envase, ...s.items.slice(indice + 1)] };
    }),

  cambiarCantidad: (clave, cantidad) =>
    set((s) => ({
      items:
        cantidad <= 0
          ? s.items.filter((i) => i.clave !== clave && i.clave !== `envase-${clave}`)
          : s.items.map((i) => (i.clave === clave ? { ...i, cantidad: redondear(cantidad) } : i)),
    })),

  cambiarDescuentoItem: (clave, descuento) =>
    set((s) => ({
      items: s.items.map((i) =>
        i.clave === clave ? { ...i, descuento: Math.max(0, Math.round(descuento)) } : i,
      ),
    })),

  quitar: (clave) =>
    set((s) => ({
      items: s.items.filter((i) => i.clave !== clave && i.clave !== `envase-${clave}`),
    })),

  cambiarDescuentoGeneral: (descuento) =>
    set({ descuentoGeneral: Math.max(0, Math.round(descuento)) }),

  vaciar: () => set({ items: [], descuentoGeneral: 0 }),
}));

// Evita errores de coma flotante al sumar kilos (0.1 + 0.2).
const redondear = (n: number) => Math.round(n * 1000) / 1000;
