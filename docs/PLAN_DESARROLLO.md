# Plan de desarrollo — Inventariado

App móvil de **inventario y punto de venta (POS)** para pequeños almacenes y botillerías.

## Objetivos del producto

- Registrar ventas en segundos, idealmente escaneando el código de barras.
- Saber en todo momento qué hay en stock y qué hay que reponer.
- Cuadrar la caja al final del día sin planillas.
- Funcionar **sin internet** (muchos locales tienen conexión inestable).
- Ser simple: la usarán dueños y cajeros sin formación técnica.

## Stack propuesto

| Capa | Propuesta | Motivo |
|------|-----------|--------|
| App móvil | React Native + Expo (TypeScript) | Un solo código para Android e iOS; cámara para escanear códigos incluida |
| Base de datos local | SQLite (expo-sqlite) | Funciona offline, rápida, sin servidor |
| Estado / UI | Zustand + React Native Paper | Livianos y fáciles de mantener |
| Backend (desde fase 4) | Supabase (Postgres + Auth) | Sincronización y respaldo en la nube sin montar servidor propio |
| Pruebas | Jest + React Native Testing Library | Estándar del ecosistema |

> Alternativa equivalente: Flutter + Drift (SQLite). Conviene decidir el stack antes de empezar la fase 0.

---

## Fase 0 — Fundaciones

**Meta:** proyecto listo para construir funciones encima.

- Crear proyecto Expo con TypeScript, ESLint, Prettier y Jest.
- Estructura de carpetas (`src/features`, `src/db`, `src/components`, ...).
- Capa de base de datos local con migraciones versionadas.
- Navegación base (pestañas: Vender, Inventario, Caja, Más).
- Formato de moneda en pesos chilenos (CLP, sin decimales) y fechas locales.
- CI en GitHub Actions: lint + tests en cada push.

**Entregable:** app que abre, navega entre pestañas vacías y pasa CI.

## Fase 1 — Catálogo de productos (MVP parte 1)

**Meta:** tener los productos cargados en la app.

- Crear, editar, desactivar y buscar productos.
- Campos: nombre, código de barras, categoría, precio de venta, costo, stock actual, stock mínimo, unidad (unidad / pack / kg).
- **Escáner de código de barras** con la cámara para crear y buscar productos.
- Categorías (bebidas, cervezas, destilados, snacks, abarrotes, cigarros...).
- Fotos opcionales del producto.
- Importación masiva desde CSV/Excel para la carga inicial.

**Entregable:** el dueño puede cargar todo su catálogo.

## Fase 2 — Ventas / punto de venta (MVP parte 2)

**Meta:** vender con la app.

- Pantalla de venta: escanear o buscar productos, carrito, cambiar cantidades, quitar ítems.
- Descuentos por ítem o por venta total.
- Medios de pago: efectivo (con cálculo de vuelto), débito, crédito, transferencia; pago mixto.
- Descuento automático del stock al confirmar la venta.
- Historial de ventas con detalle y **anulación** (devuelve el stock).
- Comprobante interno (compartir por WhatsApp / imprimir en impresora térmica Bluetooth como mejora).

**Entregable:** se puede atender la caja del local solo con la app. **Aquí termina el MVP.**

## Fase 3 — Inventario y caja

**Meta:** control real del stock y del dinero.

- **Ingreso de mercadería** (compras a proveedores): productos, cantidades y costo; actualiza stock y costo.
- Registro de proveedores.
- Ajustes de stock con motivo (merma, rotura, vencimiento, consumo interno, conteo).
- Toma de inventario (conteo físico escaneando y comparando con el sistema).
- Alertas de **stock bajo** y lista de reposición sugerida.
- Control de vencimientos por lote (opcional, útil para lácteos y cervezas).
- **Apertura y cierre de caja**: monto inicial, ventas por medio de pago, retiros/ingresos de efectivo, diferencia al cierre.

**Entregable:** el dueño sabe qué tiene, qué perdió y si la caja cuadra.

## Fase 4 — Usuarios, nube y multi-dispositivo

**Meta:** varios cajeros y respaldo seguro.

- Cuentas con Supabase Auth; el local como "negocio" con sus usuarios.
- Roles: **dueño/administrador** y **cajero** (el cajero no ve costos, no anula ventas ni ajusta stock sin autorización).
- PIN rápido para cambiar de cajero en el mismo dispositivo.
- **Sincronización offline-first**: todo se guarda local y se sube cuando hay internet; resolución de conflictos.
- Respaldo automático y restauración al cambiar de teléfono.
- Registro de auditoría (quién vendió, anuló o ajustó qué y cuándo).

**Entregable:** dos o más teléfonos trabajando sobre el mismo inventario.

## Fase 5 — Reportes

**Meta:** que los datos ayuden a decidir.

- Panel diario: ventas totales, número de ventas, ticket promedio, ganancia bruta.
- Ventas por día / semana / mes, por categoría, por medio de pago y por cajero.
- Productos más y menos vendidos; productos sin movimiento.
- Margen por producto y valorización del inventario (a costo y a precio de venta).
- Exportar reportes a Excel/PDF.

## Fase 6 — Funciones específicas del rubro

- **Fiado / cuentas corrientes** de clientes frecuentes (deuda, abonos, historial).
- **Envases retornables** (cobro y devolución de envase).
- Packs y promociones (ej. "3 x $2.000", six-pack que descuenta 6 unidades).
- Productos a granel / por peso.
- Recordatorio de horario legal de venta de alcohol y confirmación de mayoría de edad.
- Precios mayoristas por volumen.

## Fase 7 — Integraciones y cumplimiento

- **Boleta electrónica SII** mediante un proveedor autorizado (evaluar opciones y costos).
- Integración con terminales de pago (ej. SumUp, Mercado Pago Point, Getnet, Transbank) si ofrecen SDK.
- Impresoras térmicas Bluetooth y lectores de código de barras externos.
- Panel web para el dueño (ver ventas y stock desde el computador).
- Soporte multi-local.

---

## Modelo de datos inicial (fases 1–3)

```
Categoria(id, nombre)
Producto(id, nombre, codigo_barras, categoria_id, precio_venta, costo,
         stock, stock_minimo, unidad, activo, foto, creado_en, actualizado_en)
Venta(id, fecha, total, descuento, estado[completada|anulada], usuario_id, caja_id)
VentaItem(id, venta_id, producto_id, cantidad, precio_unitario, descuento)
Pago(id, venta_id, medio[efectivo|debito|credito|transferencia], monto)
Proveedor(id, nombre, rut, telefono)
Compra(id, proveedor_id, fecha, total)
CompraItem(id, compra_id, producto_id, cantidad, costo_unitario)
MovimientoStock(id, producto_id, tipo[venta|compra|ajuste|anulacion], cantidad,
                motivo, referencia_id, fecha, usuario_id)
Caja(id, apertura, cierre, monto_inicial, monto_contado, usuario_id)
MovimientoCaja(id, caja_id, tipo[ingreso|retiro], monto, motivo)
```

Todo cambio de stock queda en `MovimientoStock`, así el stock siempre es trazable.

## Preguntas abiertas

1. ¿Android solamente o también iOS?
2. ¿React Native (Expo) o Flutter?
3. ¿Un solo dispositivo por local al inicio, o varios desde el comienzo?
4. ¿La boleta electrónica es obligatoria desde el principio o puede esperar?
5. ¿Se usará impresora térmica o lector de código de barras externo?
6. ¿Uso propio en un local o producto para vender a varios negocios (modelo SaaS)?
