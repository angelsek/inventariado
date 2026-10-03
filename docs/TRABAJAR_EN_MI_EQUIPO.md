# Trabajar en tu computador (Windows)

Todo el proyecto vive en GitHub (`angelsek/inventariado`, rama
`main`). Las compilaciones del APK y del `.aab`, las pruebas y la
publicación de funciones corren en **GitHub Actions**, no en tu equipo: en el computador solo
se edita el código y se corren las revisiones rápidas. Supabase, Google Play Console y las
páginas legales siguen igual.

## 1. Instalar (una sola vez)

Abre **PowerShell** y ejecuta:

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install GitHub.cli
```

Cierra y vuelve a abrir PowerShell (normal, **sin** "Ejecutar como administrador"). Permite que
PowerShell ejecute scripts como `npm` (una sola vez; si pregunta, responde **S**):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Sin esto aparece el error _"No se puede cargar el archivo ...\npm.ps1 porque la ejecución de
scripts está deshabilitada en este sistema"_. Luego instala Claude Code:

```powershell
npm install -g @anthropic-ai/claude-code
```

(Si ya lo tienes instalado de otra forma, sirve igual.)

## 2. Descargar el proyecto

```powershell
cd $HOME\Documents
gh auth login                      # elige GitHub.com → HTTPS → iniciar sesión en el navegador
gh repo clone angelsek/inventariado stockeao
cd stockeao
git checkout main
npm ci
```

(El repositorio fija los saltos de línea en formato Linux con `.gitattributes`. Si alguna vez
`npm run check` marca "Code style issues" en casi todos los archivos, es eso: ejecuta
`git rm -r --cached -q .` y luego `git reset --hard`, sin cambios pendientes.)

Comprueba que todo funciona:

```powershell
npm run check
```

Debe terminar con `Tests: ... passed` y sin errores.

## 3. Abrir Claude Code en el proyecto

```powershell
cd $HOME\Documents\stockeao
claude
```

Al partir, Claude lee `CLAUDE.md` (que incluye `AGENTS.md` y `docs/ESTADO_ACTUAL.md`): ahí
está el estado del proyecto y lo que queda pendiente. Para retomar, basta con escribirle
algo como:

> Lee docs/ESTADO_ACTUAL.md y sigamos con el cobro de Google Play.

## 4. Día a día

| Qué                                               | Cómo                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Revisar el código (lint, formato, tipos, pruebas) | `npm run check`                                                                 |
| Subir cambios                                     | `git add -A`, `git commit -m "..."`, `git push` (o pedírselo a Claude)          |
| APK y `.aab`                                      | En **Actions**, a mano o con tag de versión; el `.aab` solo a mano desde `main` |
| Pruebas SQL                                       | Corren en GitHub Actions (CI). En Windows necesitarían WSL + PostgreSQL         |
| Probar en el teléfono                             | Instala el APK o la versión de prueba interna de Play                           |

**Expo Go no sirve** para esta app: usa módulos nativos (cobro de Google Play, cámara,
SQLite). Se prueba siempre con el APK o con Play.

## 5. Archivos que NO están en GitHub (guárdalos tú)

- `inventariado.keystore` y su contraseña (firma de la app). Sin ellos no se puede actualizar
  la app en Play.
- El JSON de la cuenta de servicio de Google Cloud (cuando lo crees).
- Los secretos de GitHub y las claves de Supabase ya están guardados en GitHub y Supabase.
