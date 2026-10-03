# Seguridad de las dependencias

`npm audit` revisa las dependencias contra la base de avisos de seguridad de GitHub (GHSA). Algunas
vulnerabilidades no tienen arreglo publicado o no afectan a Stockeao: esas se analizan, se
documentan aquí y se registran como excepción en `scripts/excepciones-audit.json`, con una fecha
de revisión.

## Cómo se revisa

```bash
npm run audit:revisar                       # informativo
AUDIT_ESTRICTO=true npm run audit:revisar   # falla ante vulnerabilidades nuevas sin analizar
```

En modo estricto también falla una excepción vencida (hay que renovarla o resolverla) y un aviso sin
identificador GHSA, que cuenta como nuevo. Una excepción que ya no aparece solo avisa.

El workflow **Dependencias** (`.github/workflows/dependencias.yml`) lo ejecuta:

- **En los PR que tocan `package.json` o `package-lock.json`:** en modo estricto. Una vulnerabilidad nueva sin analizar hace fallar el check.
- **En los demás PR y en `main`:** solo avisa. Así un aviso publicado hoy no bloquea un PR que no toca dependencias.
- **Los lunes:** en modo estricto. Si apareció algo nuevo, la ejecución queda en rojo y GitHub avisa por correo.

Por ahora no es un check obligatorio de `main`.

## Qué hacer cuando aparece una vulnerabilidad nueva

1. **Ver de dónde viene:** `npm explain <paquete>`.
2. **Si hay versión corregida compatible,** actualizar. Si es una dependencia indirecta, usar `overrides` en
   `package.json`, acotado al paquete que la trae (como `uuid` más abajo). Comprobar con
   `npm run check` y con el build del APK, que se lanza solo en los PR que tocan dependencias.
3. **Si no hay arreglo o no afecta a la app,** analizarla aquí (¿va dentro del APK o solo en las
   herramientas de compilación? ¿con qué entradas se usa?) y añadir la excepción a
   `scripts/excepciones-audit.json`, con una fecha `revisar_antes` de unos 3 meses.
4. **Cuando una excepción vence,** en modo estricto el check falla: renovarla (nueva `revisar_antes`, tras
   revisar el análisis) o resolverla. **Si deja de aparecer,** el script solo avisa: quitarla.

Nunca usar `npm audit fix --force`: propone bajar Expo a versiones de hace años y rompe la app.

## Vulnerabilidades analizadas

### node-forge

[GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), alta. Verificación de
firmas RSA PKCS#1 v1.5 demasiado permisiva.

- **Sin versión corregida:** afecta a todas las versiones hasta la 1.4.0, que es la última.
- **Llega por:** la CLI de Expo (`@expo/cli` y `@expo/code-signing-certificates`).
- **Para qué se usa:** solo para firmar los manifiestos del servidor de desarrollo y las actualizaciones OTA de
  `expo-updates`. Stockeao no usa `expo-updates` ni configura firma de actualizaciones.
- **No va dentro del APK.**
- **Decisión:** aceptar. Revisar cuando Expo actualice la dependencia.

### decode-uri-component

[GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), moderada. Denegación de
servicio con texto mal codificado.

- **Llega por:** `query-string` de `expo-router`, y **sí va dentro del APK**.
- **Por qué no afecta:** `getLinkingConfig.js` siempre define `getStateFromPath` con el fork propio de
  `expo-router` (`fork/getStateFromPath.js`), que analiza los enlaces con `parseQueryParams`
  (`fork/getStateFromPath-forks.js`, sobre `URL`/`URLSearchParams`) y tiene comentada la llamada a
  `queryString.parse`. El `getStateFromPath` del core de react-navigation, que sí usa `query-string`,
  se carga pero solo se usaría si alguien sustituyera `getStateFromPath`. Los enlaces `stockeao://…` no
  pasan por la función vulnerable. En el peor caso teórico, un enlace malicioso que el propio usuario
  toca congela la app, sin exponer datos.
- **Revalidar con cada versión de `expo-router`:** es un fork interno que puede cambiar. Comprobar que
  `node_modules/expo-router/build/fork/getStateFromPath.js` sigue sin llamar a `queryString.parse`.
- **Por qué no se fuerza la versión corregida:** la 0.5.0 es solo ESM y `query-string@7` la carga con `require`, así que
  forzarla rompería la app (y Jest).
- **Decisión:** aceptar. Revisar cuando `expo-router` actualice `query-string`.

### braces

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), alta. Denegación de
servicio con patrones glob muy anidados.

- **Sin versión corregida:** afecta a todas las versiones hasta la 3.0.3, que es la última.
- **Llega por:** `micromatch`, que solo usan las herramientas de compilación y pruebas (Metro, Jest, Babel)
  con patrones de la configuración del proyecto, nunca con datos de usuarios.
- **No va dentro del APK.**
- **Decisión:** aceptar. Revisar cuando haya versión corregida.

### uuid (resuelta)

[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), moderada.

- **Llega por:** `xcode` (prebuild de iOS) a través de `@expo/config-plugins`, que traía la versión 7.0.3.
- **Solución:** un override acotado en `package.json`, `"overrides": { "xcode": { "uuid": "^11.1.1" } }`.
- **Por qué la 11:** es la última versión en CommonJS y mantiene `uuid.v4()`, lo único que usa `xcode`.
- **Al cambiar de SDK de Expo:** comprobar si el override sigue haciendo falta.
