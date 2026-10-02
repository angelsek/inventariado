# Configurar Supabase

La app guarda en Supabase las cuentas y los datos que se comparten entre los teléfonos del local.
Esta configuración se hace una sola vez.

## 1. Proyecto

Se puede usar un proyecto **nuevo** o uno **existente** que ya tenga otra aplicación.

- Proyecto nuevo: región **South America (São Paulo)**, la más cercana a Chile.
- Proyecto compartido: todas las tablas de Stockeao viven en el esquema `inventariado`,
  separadas de las de la otra aplicación (que suelen estar en `public`). No se modifica nada
  existente. Ver [Compartir el proyecto](#compartir-el-proyecto-con-otra-aplicación).

## 2. Crear las tablas

1. En GitHub, abrir cada archivo de [`supabase/migrations/`](../supabase/migrations) y tocar
   **Raw** para ver el texto plano. Seleccionar **todo** y copiar (desde el celular es fácil
   copiar solo una parte: revisar que termine con `notify pgrst, 'reload schema';`).
2. En Supabase, **SQL Editor → New query**, pegar y presionar **Run** sin texto seleccionado
   (si hay una selección, Supabase ejecuta solo esa parte).
3. Debe responder "Success. No rows returned".

Los archivos se pueden ejecutar de nuevo sin problema: completan lo que falte y no borran datos.

Se ejecutan **en orden** (el nombre empieza con la fecha). Si un archivo ya ejecutado cambia en
una actualización, basta con volver a ejecutarlo.

## 3. Exponer el esquema

En **Project Settings → Data API → Exposed schemas**, agregar `inventariado` a la lista
(sin quitar los que ya estén, como `public`) y guardar. Sin esto la app muestra
"falta exponer el esquema".

En la misma página, si aparecen **Exposed tables** y **Exposed functions**, activar:

- Tablas de `inventariado`: `negocios`, `negocio_usuarios`, `perfiles`, `dispositivos`.
- Tablas de la fase 2: `categorias`, `productos`, `movimientos_stock`.
- Tablas de la fase 3: `ventas`, `venta_items`, `pagos`.
- Tablas de la fase 4: `proveedores`, `compras`, `compra_items`, `cajas`, `movimientos_caja`.
- Tablas de la fase 5: `planes`, `suscripciones`, `pagos_suscripcion`.
- Tablas de la fase 8: `clientes`, `movimientos_cliente`.
- Funciones de la fase 5: `registrar_dispositivo`, `mis_dispositivos`, `desvincular_dispositivo`,
  `es_admin`, `admin_listar_negocios`, `admin_registrar_pago`, `admin_actualizar_suscripcion`.
- Funciones de la fase 6: `ultima_version`, `registrar_error`, `enviar_comentario`,
  `admin_listar_reportes`, `admin_marcar_comentario`.
- Función para Play Store: `eliminar_mi_negocio`.
- Funciones de `inventariado`: `crear_negocio`, `sincronizar_descarga`.

(`es_miembro` y `marcar_cambio_sync` las usa la base internamente; no hace falta exponerlas.)

## 4. Autenticación

En **Authentication → Sign In / Providers → Email**:

- Dejar activado **Email**.
- **Confirm email**: si está activado, el dueño debe confirmar su correo antes de usar la app
  (la app lo indica). Para las pruebas conviene desactivarlo.

## 5. Conectar la app

En **Project Settings → API Keys** (o **Data API**) copiar:

- **Project URL** (ej. `https://abcd1234.supabase.co`)
- **Publishable key** (o la antigua `anon` key). **Nunca** usar la `secret` / `service_role`.

Estos dos valores son públicos por diseño: quedan dentro del APK. La seguridad la dan las reglas
RLS de la base, que solo dejan a cada cuenta ver los datos de su propio negocio.

### Para el APK de GitHub Actions

En GitHub: **Settings → Secrets and variables → Actions → pestaña Variables → New repository
variable**, y crear:

| Nombre                     | Valor           |
| -------------------------- | --------------- |
| `SUPABASE_URL`             | Project URL     |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key |

El próximo APK que se construya ya vendrá conectado.

### Para desarrollo local

Copiar `.env.example` a `.env.local` y completar los valores.

## Pruebas de la base de datos

`./scripts/probar-sql.sh` aplica las migraciones en un Postgres local y verifica los permisos
(que un negocio no pueda ver ni modificar datos de otro, etc.). Corre también en CI.

## Compartir el proyecto con otra aplicación

Funciona sin problemas mientras el uso sea bajo. A tener en cuenta:

- **Límites del plan gratuito compartidos**: base de datos de 500 MB, 50.000 usuarios activos
  al mes, transferencia mensual y almacenamiento de archivos se reparten entre ambas apps.
  Stockeao usa muy poco en estas fases (texto; las fotos de productos llegan en la fase 2).
- **Usuarios compartidos**: Supabase Auth es uno solo por proyecto. Una persona registrada en
  la otra app podría iniciar sesión en Stockeao (llegaría a la pantalla "Datos del
  negocio" y no vería datos de nadie). La configuración de correo (confirmación, plantillas)
  también es común a ambas.
- **Pausa por inactividad**: los proyectos gratuitos se pausan tras 7 días sin uso; si la otra
  app lo usa a diario, no pasa.
- **Al vender la app** (fase 5) conviene pasar a un proyecto propio. Como todo está en el
  esquema `inventariado`, se puede exportar y mover sin tocar la otra aplicación.

## Suscripciones y panel de administración (fase 5)

### Hacerte administrador

El panel **Más → Administración** solo aparece para las cuentas registradas como
administradoras. Para agregar la tuya, ejecuta en el SQL Editor (con tu correo):

```sql
insert into inventariado.administradores (usuario_id)
select id from auth.users where email = 'tu-correo@ejemplo.cl';
```

### Cambiar precios o límites de los planes

```sql
update inventariado.planes set precio_mensual = 12990, max_dispositivos = 3 where id = 'basico';
```

Volver a ejecutar el SQL de la fase 5 no pisa estos cambios.

### Datos para pagar (opcional)

En GitHub (Settings → Secrets and variables → Actions → Variables) puedes crear:

| Nombre                | Ejemplo                                          |
| --------------------- | ------------------------------------------------ |
| `CONTACTO_WHATSAPP`   | `+56912345678`                                   |
| `CONTACTO_CORREO`     | `contacto@tu-dominio.cl`                         |
| `DATOS_TRANSFERENCIA` | `Banco X, cuenta vista 123456, RUT 11.111.111-1` |

Aparecen en la pantalla Suscripción de tus clientes. Sin `DATOS_TRANSFERENCIA` (lo que se usa
hoy), la pantalla pide escribir por WhatsApp y los datos para pagar se entregan en el chat; con
ella, muestra los datos y un botón "Avisar que pagué".
