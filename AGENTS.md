This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Convenciones de este proyecto

- El código, los nombres y los textos de la app van en español (Chile). Montos en CLP sin decimales (`src/lib/formato.ts`).
- Solo Android. El APK se genera con el workflow `.github/workflows/build-apk.yml` (o `eas build --profile preview`).
- Base local SQLite: las migraciones viven en `src/db/migraciones.ts`; nunca se edita una migración publicada, se agrega una nueva al final.
- Importar desde `src` con el alias `@/` (ej. `@/lib/formato`).
- Antes de terminar una tarea: `npm run check` (lint + formato + tipos + pruebas).
- Si `npx expo install` falla por red, usar `EXPO_OFFLINE=1 npx expo install <paquete>`.
- Nunca poner pruebas dentro de `src/app/` (Expo Router trataría cada archivo como pantalla); van en `src/__tests__/` o junto al módulo en `__tests__/`.
- Base de datos del servidor: migraciones SQL en `supabase/migrations/`, pruebas en `supabase/tests/` (`./scripts/probar-sql.sh`).
- Antes de añadir o actualizar dependencias, corre `npm run audit:revisar`; nunca `npm audit fix --force`. Las excepciones van en `scripts/excepciones-audit.json`, con su análisis en `docs/SEGURIDAD_DEPENDENCIAS.md`.
- Si corres `npx expo prebuild` para revisar el proyecto Android, respalda `package.json` antes y restáuralo después (prebuild cambia el script `android`); no uses `git checkout package.json`, que borra dependencias recién agregadas. Borra la carpeta `android/` al terminar.
