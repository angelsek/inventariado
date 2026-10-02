import type { Producto } from '@/db/productos';

import { calcularTotales } from '../calculos';
import { useCarrito } from '../carrito';

const producto = (cambios: Partial<Producto>): Producto => ({
  id: 'p1',
  negocioId: 'n',
  nombre: 'Cerveza',
  codigoBarras: null,
  categoriaId: null,
  categoria: null,
  precioVenta: 1290,
  costo: 800,
  stockMinimo: 0,
  unidad: 'unidad',
  activo: true,
  stock: 10,
  precioEnvase: 0,
  packProductoId: null,
  packCantidad: null,
  promoCantidad: null,
  promoPrecio: null,
  alcohol: false,
  ...cambios,
});

beforeEach(() => useCarrito.getState().vaciar());

it('agregar el mismo producto suma cantidad en una sola línea', () => {
  const c = useCarrito.getState();
  c.agregarProducto(producto({}));
  c.agregarProducto(producto({}));
  c.agregarProducto(producto({ id: 'p2', nombre: 'Queso', unidad: 'kg', precioVenta: 9990 }), 0.1);
  useCarrito.getState().agregarProducto(producto({ id: 'p2' }), 0.2);

  const { items } = useCarrito.getState();
  expect(items.map((i) => [i.nombre, i.cantidad])).toEqual([
    ['Cerveza', 2],
    ['Queso', 0.3],
  ]);
});

it('cantidad cero quita la línea; montos libres son líneas separadas', () => {
  const c = useCarrito.getState();
  c.agregarProducto(producto({}));
  c.agregarMontoLibre('', 500);
  c.agregarMontoLibre('Hielo', 1500);
  useCarrito.getState().cambiarCantidad('p1', 0);

  const { items } = useCarrito.getState();
  expect(items.map((i) => [i.nombre, i.precioUnitario])).toEqual([
    ['Varios', 500],
    ['Hielo', 1500],
  ]);
  expect(calcularTotales(items, 0).total).toBe(2000);
});
