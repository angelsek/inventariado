# Stockeao

App móvil (Android) de inventario y punto de venta para negocios de barrio: almacenes,
botillerías, kioskos y bazares.

- [Plan de desarrollo por fases](docs/PLAN_DESARROLLO.md)
- [Configurar Supabase](docs/SUPABASE.md) (servidor: cuentas y sincronización)
- [Piloto con locales reales](docs/PILOTO.md) (firma, publicar versiones, respaldos)
- [Publicar en Google Play](docs/PLAY_STORE.md) (ficha, formularios y App Bundle)
- [Cobro con Google Play](docs/COBRO_GOOGLE_PLAY.md) (suscripción con 14 días gratis)
- [Trabajar en tu computador](docs/TRABAJAR_EN_MI_EQUIPO.md) · [Estado actual](docs/ESTADO_ACTUAL.md)

## Tecnología

React Native + Expo (TypeScript), Expo Router, SQLite local y Supabase para sincronizar
entre teléfonos. Ver el plan para el detalle.

## Estructura

```
src/
  app/          Pantallas (cada archivo es una ruta de Expo Router)
    (tabs)/     Pestañas: Inicio, Productos, Vender, Caja, Más
  components/   Componentes reutilizables
  db/           Base de datos local, migraciones y consultas
  features/     Piezas de pantallas agrupadas por función
  lib/          Utilidades (formato de pesos, RUT, PIN, cliente Supabase)
  sesion/       Cuenta, negocio vinculado y usuario activo
  sync/         Sincronización con el servidor
  theme/        Colores
supabase/
  migrations/   Tablas y reglas de seguridad del servidor
  tests/        Pruebas SQL (./scripts/probar-sql.sh)
```

## Desarrollo

Requisitos: Node.js 22.

```bash
npm install
npm start          # servidor de desarrollo (requiere un build de desarrollo: Expo Go no sirve
                   # porque la app usa módulos nativos; lo normal es probar con el APK de Actions)
npm run check      # lint + formato + tipos + pruebas
./scripts/probar-sql.sh   # pruebas de la base del servidor (requiere Postgres)
```

Para conectarse al servidor, copiar `.env.example` a `.env.local` con los datos de Supabase.

## Obtener el APK

**Opción 1 — GitHub Actions (sin instalar nada):**

1. En GitHub, ir a **Actions → Construir APK → Run workflow**.
   También se ejecuta solo en cada push a `main`.
2. Al terminar (unos 15–20 min), abrir la ejecución y descargar el APK en **Artifacts**.
3. Pasar el APK al teléfono, abrirlo y permitir "instalar apps de origen desconocido".

Cada build tiene un número de versión mayor, así que se instala encima de la anterior sin perder datos.

> Por ahora el APK se firma con la clave de desarrollo. Antes de entregarlo a clientes (fase 6)
> se configurará una clave de firma definitiva.

**Opción 2 — EAS Build (servicio de Expo, requiere cuenta gratuita):**

```bash
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```
