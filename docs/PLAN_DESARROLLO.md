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

**Estado:** ✅ completada (SQL ejecutado en Supabase, APK build 8).

## Fase 3 — Ventas (fin del MVP)

**Meta:** atender la caja solo con la app.

- Pantalla Vender: escáner **continuo** (se leen varios productos seguidos sin cerrar la
  cámara), búsqueda por nombre, carrito con + / −, edición de cantidad y descuento por línea.
- Productos por kilo: se pide el peso (atajos 0,25 / 0,5 / 1 kg).
- **Monto libre** para cobrar algo que no está en el catálogo (ej. hielo, pan a granel).
- Cobro: descuento a toda la venta; efectivo con montos rápidos y cálculo de **vuelto**;
  débito, crédito, transferencia; **pago mixto** (ej. parte débito, parte efectivo).
- Al confirmar: venta, ítems (con copia de nombre, precio y costo) y pagos en una sola
  transacción, y movimiento de stock negativo por producto. Se permite vender aunque el stock
  registrado no alcance (se avisa en el carrito).
- Ventas del día con total por medio de pago; navegación por días.
- Detalle de venta; **comprobante interno** para compartir por WhatsApp (no es boleta).
- **Anulación** solo por el dueño, con motivo: devuelve el stock y deja de sumar en los totales.
- Todo funciona sin internet y se sincroniza después.

**Entregable:** primera versión usable en un local real.

**Estado:** ✅ completada (SQL ejecutado en Supabase).

## Fase 4 — Inventario y caja

**Meta:** control real del stock y del dinero.

- **Ingreso de mercadería**: proveedor (o sin proveedor), N° de factura/guía, productos por
  búsqueda o escáner continuo, cantidad y costo por línea; suma stock y puede actualizar el
  costo de cada producto. Historial de ingresos.
- **Proveedores**: nombre, RUT validado y teléfono.
- **Ajustes de stock** desde la ficha del producto, con motivo (merma, rotura, vencimiento,
  consumo interno, robo o pérdida, corrección).
- **Historial de stock** por producto: cada movimiento con tipo, motivo, quién y cuándo.
- **Conteo de inventario**: cada escaneo suma 1 (o se escribe la cantidad); muestra la
  diferencia contra el sistema y al aplicar deja el stock igual a lo contado.
- **Por reponer**: productos sin stock o bajo el mínimo; se comparte la lista por WhatsApp.
- **Caja por teléfono**: apertura con efectivo inicial, ingresos y retiros con motivo, efectivo
  esperado en vivo (inicial + ventas en efectivo + ingresos − retiros), cierre con efectivo
  contado y diferencia (cuadra / sobra / falta), resumen compartible e historial de cierres.
  Las ventas quedan ligadas a la caja abierta del teléfono. Si la caja está cerrada, Vender lo
  avisa pero permite vender.
- Pendiente: vencimientos por lote (opcional).

**Entregable:** el dueño sabe qué tiene, qué perdió y si cada caja cuadra.

**Estado:** ✅ completada (SQL ejecutado en Supabase).

## Fase 5 — Suscripciones y administración del servicio

**Meta:** poder cobrar a los negocios clientes.

- Planes en la base de datos (se cambian con SQL): **Básico** $9.990/mes, 2 teléfonos; **Pro**
  $19.990/mes, 5 teléfonos + reportes avanzados (fase 7).
- **Prueba gratis de 14 días** (con plan Pro) creada automáticamente al registrar un negocio.
- Estados: prueba → activa → vencida (7 días de gracia, la app avisa) → suspendida (solo
  lectura: se ven los datos pero no se vende ni se modifica nada). Nunca se borran datos.
- **Sin pasarela de pago** por ahora: el cliente paga (ej. transferencia) y el administrador
  registra el pago desde el **panel de administración** de la app, que extiende la suscripción
  sin perder días de prueba o ya pagados.
- **Límite de teléfonos** por plan, validado en el servidor al iniciar sesión; el dueño puede
  **desvincular** teléfonos desde Más → Suscripción (el teléfono desvinculado cierra sesión).
- Pantalla Suscripción: estado, planes, teléfonos, historial de pagos y cómo pagar.
- Panel de administración: clientes con estado, vencimiento, teléfonos y última conexión;
  registrar pagos, extender prueba, suspender o reactivar; ingreso mensual estimado.
- Borradores de **Términos y condiciones** y **Política de privacidad** (revisar con abogado).
- Pendiente: conectar con los terminales POS (Transbank, Getnet, etc.) al publicar en Play Store.

**Estado:** ✅ completada (SQL ejecutado en Supabase).

## Fase 6 — Piloto con locales reales

**Meta:** validar con clientes antes de crecer. Guía: `docs/PILOTO.md`.

- **Aviso de versión nueva**: el workflow "Construir APK" puede publicar el APK en Supabase
  Storage y registrar la versión; la app avisa y descarga desde ahí (los clientes no necesitan
  GitHub). Opción de actualización obligatoria. Enlace fijo a la última versión.
- **Firma con clave propia** (plugin de Expo + secretos de GitHub) antes de entregar a clientes.
- **Registro de errores** propio (sin servicios externos): errores de pantalla y no capturados
  llegan al panel de administración con versión y modelo de teléfono.
- **Comentarios** desde la app (Más → Enviar comentario o problema), visibles para el
  administrador, con marca de leído.
- **Exportar datos** (dueño): productos en CSV reimportable, ventas por ítem en CSV (mes actual
  y anterior) y respaldo completo en JSON.
- **Respaldo semanal** de la base de datos con GitHub Actions (pg_dump, 90 días).
- Pendiente del dueño del proyecto: crear la clave de firma, los secretos y elegir los locales.

**Estado:** ✅ completada (SQL ejecutado, clave de firma y secretos creados).

## Fase 7 — Reportes

- Panel diario: ventas totales, número de ventas, ticket promedio, ganancia bruta.
- Ventas por día / semana / mes, por categoría, por medio de pago y por cajero.
- Productos más y menos vendidos; productos sin movimiento.
- Margen por producto y valorización del inventario.
- Exportar a Excel/PDF.

**Estado:** ✅ completada. Más → Reportes del negocio (solo dueño), calculado en el teléfono
con los datos sincronizados de todos los teléfonos (funciona sin internet, sin SQL nuevo):

- **Ventas:** día / semana / mes con flechas para ir a períodos anteriores. Total, número de
  ventas, ticket promedio, ganancia y margen; comparación con el período anterior (si el período
  está en curso, contra el mismo tramo: hoy hasta esta hora vs. ayer hasta la misma hora).
  Barras por día, por hora (hora de más venta), medio de pago, cajero y categoría. Aviso de
  productos vendidos sin costo (la ganancia real es menor), descuentos y anuladas.
- **Productos:** 10 más vendidos (con ganancia), menos vendidos y productos con stock sin ventas
  en el período (con su valor a costo).
- **Inventario:** valor de la mercadería a costo y a precio de venta, ganancia posible, avisos de
  productos sin costo o con stock negativo, y margen por producto (primero los más bajos).
- **Exportar a Excel:** el reporte del período en CSV. (PDF queda para más adelante.)

## Fase 8 — Funciones del rubro

- Fiado / cuentas corrientes de clientes frecuentes.
- Envases retornables.
- Packs y promociones (ej. "3 x $2.000", six-pack que descuenta 6 unidades).
- Productos a granel / por peso.
- Aviso de horario legal de venta de alcohol y confirmación de mayoría de edad.

## Fase 9 — Play Store y crecimiento

- **Preparación para Google Play (hecha):** eliminación de cuenta y datos desde la app (y
  página web), App Bundle firmado con workflow propio (subida opcional automática a Play),
  permisos mínimos (cámara e internet), ícono e imagen destacada propios, páginas legales
  públicas generadas desde la app, canal "play" que oculta pagos externos (política de pagos)
  y deja las actualizaciones a Play. Guía completa: `docs/PLAY_STORE.md`.
- Pendiente: verificación de la cuenta de Play, clave de firma, prueba cerrada (12 personas,
  14 días si la cuenta es personal), capturas de pantalla y publicación.
- Más adelante: conexión con terminales POS (Transbank, Getnet, etc.), panel web para el
  dueño, multi-local, boleta electrónica SII, iOS.

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
