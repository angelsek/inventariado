# Configurar Supabase

La app guarda en Supabase las cuentas y los datos que se comparten entre los teléfonos del local.
Esta configuración se hace una sola vez.

## 1. Proyecto

Se puede usar un proyecto **nuevo** o uno **existente** que ya tenga otra aplicación.

- Proyecto nuevo: región **South America (São Paulo)**, la más cercana a Chile.
- Proyecto compartido: todas las tablas de Inventariado viven en el esquema `inventariado`,
  separadas de las de la otra aplicación (que suelen estar en `public`). No se modifica nada
  existente. Ver [Compartir el proyecto](#compartir-el-proyecto-con-otra-aplicación).

## 2. Crear las tablas

1. En el proyecto, abrir **SQL Editor → New query**.
2. Copiar y ejecutar, en orden, cada archivo de [`supabase/migrations/`](../supabase/migrations).
   Cada archivo se ejecuta **una sola vez**. Cuando se agreguen archivos nuevos en próximas
   fases, solo se ejecutan los nuevos.

## 3. Exponer el esquema

En **Project Settings → Data API → Exposed schemas**, agregar `inventariado` a la lista
(sin quitar los que ya estén, como `public`) y guardar. Sin esto la app muestra
"falta exponer el esquema".

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
  Inventariado usa muy poco en estas fases (texto; las fotos de productos llegan en la fase 2).
- **Usuarios compartidos**: Supabase Auth es uno solo por proyecto. Una persona registrada en
  la otra app podría iniciar sesión en Inventariado (llegaría a la pantalla "Datos del
  negocio" y no vería datos de nadie). La configuración de correo (confirmación, plantillas)
  también es común a ambas.
- **Pausa por inactividad**: los proyectos gratuitos se pausan tras 7 días sin uso; si la otra
  app lo usa a diario, no pasa.
- **Al vender la app** (fase 5) conviene pasar a un proyecto propio. Como todo está en el
  esquema `inventariado`, se puede exportar y mover sin tocar la otra aplicación.
