# Configurar Supabase

La app guarda en Supabase las cuentas y los datos que se comparten entre los teléfonos del local.
Esta configuración se hace una sola vez.

## 1. Crear el proyecto

1. Crear una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo.
   - Región: **South America (São Paulo)**, la más cercana a Chile.
   - Guardar la contraseña de la base de datos en un lugar seguro.

## 2. Crear las tablas

1. En el proyecto, abrir **SQL Editor → New query**.
2. Copiar y ejecutar, en orden, cada archivo de [`supabase/migrations/`](../supabase/migrations).
   Cada archivo se ejecuta **una sola vez**. Cuando se agreguen archivos nuevos en próximas
   fases, solo se ejecutan los nuevos.

## 3. Autenticación

En **Authentication → Sign In / Providers → Email**:

- Dejar activado **Email**.
- **Confirm email**: si está activado, el dueño debe confirmar su correo antes de usar la app
  (la app lo indica). Para las pruebas conviene desactivarlo.

## 4. Conectar la app

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
