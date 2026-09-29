# Inventariado

App móvil (Android) de inventario y punto de venta para pequeños almacenes y botillerías.

- [Plan de desarrollo por fases](docs/PLAN_DESARROLLO.md)

## Tecnología

React Native + Expo (TypeScript), Expo Router, SQLite local. Ver el plan para el detalle.

## Estructura

```
src/
  app/          Pantallas (cada archivo es una ruta de Expo Router)
    (tabs)/     Pestañas: Vender, Inventario, Caja, Más
  components/   Componentes reutilizables
  db/           Base de datos local y migraciones
  lib/          Utilidades (formato de pesos, fechas...)
  theme/        Colores
```

## Desarrollo

Requisitos: Node.js 22.

```bash
npm install
npm start          # abre el servidor de desarrollo; escanear el QR con Expo Go en Android
npm run check      # lint + formato + tipos + pruebas
```

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
