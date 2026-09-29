# Plan de desarrollo — Inventariado

App móvil de **inventario y punto de venta (POS)** para pequeños almacenes y botillerías,
vendida a otros negocios como **servicio con pago mensual** (SaaS).

## Decisiones tomadas

| Tema               | Decisión                                                         |
| ------------------ | ---------------------------------------------------------------- |
| Plataforma         | **Solo Android** por ahora                                       |
| Distribución       | **APK instalable** directamente; Play Store más adelante         |
| Tecnología         | **React Native + Expo** (TypeScript)                             |
| Dispositivos       | **Varios teléfonos por local**, compartiendo inventario y ventas |
| Código de barras   | **Cámara del teléfono** (sin lectores externos)                  |
| Boleta electrónica | **Fuera del alcance** por ahora                                  |
| Modelo de negocio  | **Suscripción mensual** por negocio                              |

Consecuencia importante: como hay varios teléfonos por local y varios negocios clientes,
la app necesita **backend en la nube y cuentas desde el principio**, y la base de datos
debe ser **multi-negocio** (cada negocio ve solo sus datos).

## Objetivos del producto

- Registrar ventas en segundos escaneando el código de barras con la cámara.
- Saber en todo momento qué hay en stock y qué hay que reponer.
- Cuadrar la caja al final del día sin planillas.
- Seguir vendiendo **sin internet** y sincronizar al volver la conexión.
- Ser simple: la usarán dueños y cajeros sin formación técnica.

## Stack

| Capa            | Tecnología                                                             | Motivo                                                                 |
| --------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| App             | React Native + Expo (TypeScript)                                       | Rápido de desarrollar, cámara y escáner incluidos (expo-camera)        |
| Base local      | SQLite (expo-sqlite)                                                   | Permite vender sin internet                                            |
| Backend         | Supabase (Postgres + Auth + Row Level Security)                        | Cuentas, datos por negocio y sincronización sin montar servidor propio |
| Sincronización  | Capa propia sobre Supabase (evaluar PowerSync si crece la complejidad) | Offline-first entre varios teléfonos                                   |
| UI / estado     | React Native Paper + Zustand                                           | Livianos y fáciles de mantener                                         |
| Build del APK   | EAS Build (perfil `apk`)                                               | Genera el APK instalable sin Play Store                                |
| Actualizaciones | EAS Update + aviso de nueva versión dentro de la app                   | Sin Play Store no hay actualización automática                         |
| Cobro mensual   | Mercado Pago o Flow (suscripciones / cobro recurrente)                 | Medios de pago usados en Chile                                         |
| Pruebas / CI    | Jest + GitHub Actions                                                  | Revisiones automáticas en cada cambio                                  |

### Reglas de diseño para que la sincronización funcione

- Identificadores **UUID** generados en el teléfono (no números correlativos).
- Todas las tablas llevan `negocio_id`, `actualizado_en` y borrado lógico (`eliminado`).
- Las ventas y movimientos de stock **nunca se editan, solo se agregan** (una anulación es un
  registro nuevo). Así dos teléfonos que venden a la vez no generan conflictos.
- El stock se calcula a partir de los movimientos, no se sobrescribe un número.

---

## Fase 0 — Fundaciones

**Meta:** proyecto listo y primer APK instalable.

- Proyecto Expo con TypeScript, ESLint, Prettier y Jest.
- Estructura de carpetas (`src/features`, `src/db`, `src/components`, `src/sync`...).
- Base de datos local SQLite con migraciones versionadas.
- Navegación base (pestañas: Vender, Inventario, Caja, Más).
- Formato de pesos chilenos (CLP, sin decimales) y fechas locales.
- CI en GitHub Actions: lint + tests.
- Configurar EAS Build y generar el **primer APK** para instalar en un teléfono de prueba.

**Entregable:** APK que se instala, abre y navega entre pestañas vacías.

**Estado:** ✅ completada. El APK se genera en GitHub Actions (ver README).

## Fase 1 — Cuentas, negocios y sincronización base

**Meta:** varios teléfonos del mismo local conectados a la misma cuenta.

- Proyecto Supabase con tablas multi-negocio y reglas de seguridad (RLS) por `negocio_id`.
- Registro del negocio (nombre, RUT validado, dirección) y del dueño.
- Inicio de sesión; la sesión queda guardada para trabajar sin internet.
- **Cuenta por negocio + perfiles con PIN:** todos los teléfonos del local inician sesión con la
  cuenta del negocio (correo y contraseña del dueño). Cada persona (dueño o cajero) es un
  **perfil** que entra con su PIN de 4 dígitos. Los cajeros no necesitan correo.
- Roles: **dueño** y **cajero**. Solo el dueño administra usuarios y cierra la sesión del
  teléfono. (Costos, anulaciones y ajustes se restringirán en las fases 2–4.)
- El dueño puede recuperar su PIN confirmando la contraseña de la cuenta.
- Motor de sincronización: guardar local → subir cambios → bajar cambios de otros teléfonos.
  Sincroniza al abrir, al volver a la app y cada minuto.
- Indicador de estado en "Más": sincronizado / cambios por subir / sin conexión.

**Entregable:** dos teléfonos inician sesión en el mismo negocio y ven los mismos datos.

**Estado:** ✅ completada. Supabase configurado (esquema `inventariado` en un proyecto
compartido) y negocio creado desde el teléfono.

## Fase 2 — Catálogo de productos

**Meta:** tener los productos cargados.

- Crear, editar, desactivar y buscar productos (por palabras en cualquier orden o por código).
- Campos: nombre, código de barras, categoría, precio de venta, costo (con ganancia y margen),
  stock inicial, aviso de stock mínimo, unidad (unidad / pack / kilo).
- **Escáner con la cámara**: desde el inventario abre el producto; si no existe, abre el
  formulario de producto nuevo con el código ya puesto (EAN-13/8, UPC, Code 128/39, ITF-14).
- Categorías, con un botón para agregar las sugeridas (bebidas, cervezas, vinos, destilados...).
- Importación desde Excel guardado como CSV; si el código ya existe, actualiza el producto.
- El stock es la suma de movimientos (`movimientos_stock`); el stock inicial es el primero.
- El cajero ve precio y stock, pero no el costo, y no puede crear ni editar.
- Aviso local de código de barras duplicado (sin restricción en el servidor, para no trabar la
  sincronización si dos teléfonos sin conexión usan el mismo código).
- Pendiente para más adelante: fotos de productos (usan almacenamiento del plan gratuito).

**Entregable:** el dueño carga su catálogo y aparece en todos los teléfonos del local.

**Estado:** 🚧 código listo; falta ejecutar el SQL de la fase 2 en Supabase y probar.

## Fase 3 — Ventas (fin del MVP)

**Meta:** atender la caja solo con la app.

- Pantalla de venta: escanear o buscar, carrito, cambiar cantidades, quitar ítems.
- Descuentos por ítem o por venta total.
- Medios de pago: efectivo (con cálculo de vuelto), débito, crédito, transferencia; pago mixto.
- Descuento automático del stock al confirmar.
- Historial de ventas con detalle y anulación (devuelve el stock, requiere rol dueño).
- Comprobante interno para compartir por WhatsApp (no es boleta tributaria).
- Ventas funcionando sin internet y sincronizadas después.

**Entregable:** primera versión usable en un local real.

## Fase 4 — Inventario y caja

**Meta:** control real del stock y del dinero.

- Ingreso de mercadería (compras a proveedores): actualiza stock y costo.
- Registro de proveedores.
- Ajustes de stock con motivo (merma, rotura, vencimiento, consumo interno).
- Toma de inventario: conteo físico escaneando y comparando con el sistema.
- Alertas de stock bajo y lista de reposición sugerida.
- **Apertura y cierre de caja por teléfono/cajero**: monto inicial, ventas por medio de pago,
  retiros e ingresos de efectivo, diferencia al cierre.
- Registro de auditoría (quién vendió, anuló o ajustó qué y cuándo).

**Entregable:** el dueño sabe qué tiene, qué perdió y si cada caja cuadra.

## Fase 5 — Suscripciones y administración del servicio

**Meta:** poder cobrar a los negocios clientes.

- Planes (ej. Básico: 1–2 teléfonos; Pro: más teléfonos y reportes avanzados).
- **Prueba gratuita** (ej. 14 días) al registrarse.
- Cobro mensual recurrente con Mercado Pago o Flow; webhook que actualiza el estado.
- Estados de la suscripción: prueba, activa, vencida (con **período de gracia**), suspendida.
- Al vencer: la app avisa; tras la gracia pasa a **solo lectura** (nunca se borran datos).
- Límite de teléfonos según el plan.
- Panel interno de administración (para ti): negocios, planes, pagos, activar/suspender.
- Términos y condiciones y política de privacidad.

**Entregable:** un negocio nuevo se registra, prueba la app y paga su mensualidad.

## Fase 6 — Piloto con locales reales

**Meta:** validar con clientes antes de crecer.

- Instalar el APK en 2–3 locales de prueba.
- Sistema de actualizaciones: EAS Update para cambios menores y aviso de nueva versión del APK.
- Reporte de errores (ej. Sentry) y respaldo de datos.
- Recoger comentarios y corregir lo más urgente.

## Fase 7 — Reportes

- Panel diario: ventas totales, número de ventas, ticket promedio, ganancia bruta.
- Ventas por día / semana / mes, por categoría, por medio de pago y por cajero.
- Productos más y menos vendidos; productos sin movimiento.
- Margen por producto y valorización del inventario.
- Exportar a Excel/PDF.

## Fase 8 — Funciones del rubro

- Fiado / cuentas corrientes de clientes frecuentes.
- Envases retornables.
- Packs y promociones (ej. "3 x $2.000", six-pack que descuenta 6 unidades).
- Productos a granel / por peso.
- Aviso de horario legal de venta de alcohol y confirmación de mayoría de edad.

## Fase 9 — Play Store y crecimiento

- Publicación en Google Play (revisar su política para suscripciones cobradas fuera de la app).
- Panel web para el dueño (ventas y stock desde el computador).
- Soporte multi-local (una cuenta, varias sucursales).
- Más adelante: boleta electrónica SII, terminales de pago, impresora térmica, iOS.

---

## Modelo de datos inicial

Todas las tablas de datos del negocio incluyen además `negocio_id`, `actualizado_en` y `eliminado`.

```
Negocio(id, nombre, rut, direccion, creado_en)
NegocioUsuario(negocio_id, usuario_id)   -- cuentas de Supabase Auth con acceso al negocio
Perfil(id, negocio_id, nombre, rol[dueno|cajero], pin_hash, activo)
Dispositivo(id, negocio_id, nombre, ultimo_sync)
Suscripcion(id, negocio_id, plan, estado[prueba|activa|vencida|suspendida],
            vence_en, proveedor_pago, referencia_externa)

Categoria(id, nombre)
Producto(id, nombre, codigo_barras, categoria_id, precio_venta, costo,
         stock_minimo, unidad, activo, foto)
Venta(id, fecha, total, descuento, estado[completada|anulada], perfil_id,
      dispositivo_id, caja_id)
VentaItem(id, venta_id, producto_id, cantidad, precio_unitario, descuento)
Pago(id, venta_id, medio[efectivo|debito|credito|transferencia], monto)
Proveedor(id, nombre, rut, telefono)
Compra(id, proveedor_id, fecha, total)
CompraItem(id, compra_id, producto_id, cantidad, costo_unitario)
MovimientoStock(id, producto_id, tipo[venta|compra|ajuste|anulacion|conteo],
                cantidad, motivo, referencia_id, fecha, perfil_id, dispositivo_id)
Caja(id, dispositivo_id, perfil_id, apertura, cierre, monto_inicial, monto_contado)
MovimientoCaja(id, caja_id, tipo[ingreso|retiro], monto, motivo)
```

El stock de un producto es la suma de sus `MovimientoStock`.

## Pendientes por definir

- Precio de los planes y cantidad de teléfonos incluidos en cada uno.
- Proveedor de cobro: Mercado Pago o Flow.
- Nombre comercial de la app.
