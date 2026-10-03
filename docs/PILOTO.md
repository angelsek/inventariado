# Piloto con locales reales

Guía para entregar Stockeao a los primeros locales y mantenerlo funcionando.

## 1. Clave de firma definitiva (antes de entregar la app)

Hasta ahora los APK se firman con la **clave de desarrollo**, que es pública (viene en la
plantilla de React Native). Antes de entregar la app a clientes hay que firmarla con una clave
propia: así nadie más puede publicar un APK que se instale encima del tuyo.

> **Importante:** al cambiar de clave, los teléfonos que ya tienen la app instalada deben
> **desinstalarla una vez** e instalar la nueva. Antes de desinstalar, abre la app y revisa en
> Más que diga "Todo sincronizado": los datos vuelven solos desde la nube al iniciar sesión.

### Crear la clave (una sola vez, en un computador)

Necesitas Java (viene con Android Studio, o instala "Temurin JDK 17"). En una terminal:

```bash
keytool -genkeypair -v -keystore inventariado.keystore -alias inventariado \
  -keyalg RSA -keysize 2048 -validity 10000
```

Te pide una contraseña (anótala) y algunos datos (nombre, ciudad; pueden ser simples).

Convierte el archivo a texto para guardarlo en GitHub:

- **Windows (PowerShell):**
  `[Convert]::ToBase64String([IO.File]::ReadAllBytes("inventariado.keystore")) | Set-Clipboard`
  (queda copiado en el portapapeles)
- **Mac:** `base64 -i inventariado.keystore | pbcopy`
- **Linux:** `base64 -w0 inventariado.keystore`

### Guardarla en GitHub

**Settings → Secrets and variables → Actions → pestaña Secrets → New repository secret**
(son _secretos_, no variables: nadie puede volver a verlos):

| Nombre                      | Valor                            |
| --------------------------- | -------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | El texto largo del paso anterior |
| `ANDROID_KEYSTORE_PASSWORD` | La contraseña que elegiste       |
| `ANDROID_KEY_ALIAS`         | `inventariado`                   |

**Guarda también el archivo `inventariado.keystore` y la contraseña en un lugar seguro**
(por ejemplo, un pendrive y un gestor de contraseñas). Si se pierden, no se podrán publicar
actualizaciones sin que los clientes reinstalen la app, y Play Store la exigirá.

## 2. Publicar una versión nueva para los clientes

Los clientes no entran a GitHub: la app les avisa cuando hay una versión nueva y la descarga
de las Releases del repo. El SHA-256 de cada APK queda registrado en tu Supabase.

**Antes de la primera publicación con la verificación (paso manual obligatorio):** ejecuta
`supabase/migrations/20261003000100_versiones_app_sha256.sql` en el SQL Editor de Supabase, como
se explica en `docs/SUPABASE.md`. Agrega la columna `sha256` a `versiones_app`; sin ella el
workflow se detiene antes de crear la Release. Además, la primera publicación debe hacerse
**después de fusionar** este cambio a `main`: si el run 46 o posterior se publicara con el
workflow antiguo (sin hash), las apps nuevas lo rechazarían.

**Una sola vez:** crea el secreto `SUPABASE_SERVICE_ROLE_KEY` con la clave **secreta** del
proyecto (Supabase → Project Settings → API Keys → _secret key_ o la antigua _service_role_).
Esta clave nunca va dentro de la app; solo la usa GitHub para registrar la versión.

**Cada vez que quieras publicar:**

1. GitHub → **Actions → Construir APK → Run workflow**.
2. Elige la rama **main** (publicar desde otra rama falla al inicio), marca **"Publicar para los
   clientes"** y escribe las novedades (opcional). Marca **"Actualización obligatoria"** solo si
   la versión anterior tiene un problema grave.
3. Al terminar (~15 min), el APK queda como **Release** en GitHub y las apps de los clientes
   muestran "Hay una versión nueva → Actualizar": la app lo descarga y abre el instalador.

**Otra forma, con un tag de versión** (compila y publica sin entrar a Actions):

```powershell
git tag -a v1.0.1 -m "Novedades de esta versión"
git push origin v1.0.1
```

El tag debe coincidir con `expo.version` de `app.json` y apuntar a un commit que ya esté en
`main`. Las novedades salen de la anotación del tag (un tag ligero, sin `-a`, publica sin
novedades) y la actualización no es obligatoria.

**Verificación del APK.** Al publicar, el workflow calcula el SHA-256 del APK al compilarlo y
lo vuelve a comprobar antes de publicar; sube a la Release el archivo `stockeao.apk.sha256`,
registra el hash en `versiones_app` y comprueba, con la clave pública, que `ultima_version` lo
devuelve. Si algo falla después de crear la Release, el workflow borra la Release y la fila, así
que se puede reintentar. Para verificar a mano un APK descargado, con `stockeao.apk.sha256` en la
misma carpeta:

```bash
sha256sum -c stockeao.apk.sha256
```

En Windows: `Get-FileHash stockeao.apk -Algorithm SHA256` y compara el resultado con el contenido
del `.sha256`.

**Qué hace la app.** Solo descarga APK de las Releases del repo y, antes de instalar, comprueba
que su SHA-256 coincida con el publicado en Supabase (también el APK que ya estaba descargado).
Si el cliente ve:

- **"La descarga no se instaló"**, con el botón **Reintentar**: el archivo no coincidía; la app lo
  borró y no abre el navegador. Basta con reintentar.
- **"No se puede instalar esta versión… Avisa a soporte"**: la versión publicada no apunta a las
  Releases o (desde el `versionCode` 46) no trae hash. Reintentar no lo arregla: hay que volver a
  publicar bien la versión.

Las versiones anteriores a la 46 sin hash se instalan sin verificar y la app registra un aviso.

No lances otra publicación mientras una esté en curso. Y no renombres `build-apk.yml`: el
número de versión interno (`versionCode`) es el número de ejecución de ese workflow.

Los PR que tocan `package.json`, `app.json`, `eas.json`, `assets/`, `plugins/`, `modules/` o el
propio workflow también compilan el APK, pero solo para comprobar que arma (sin la clave de
firma, y el archivo dura 1 día).

Para instalar la app en un teléfono nuevo: **https://grimoriolabs.com/stockeao/** (página con
el botón de descarga y los pasos). El botón usa el enlace fijo
`https://github.com/angelsek/inventariado/releases/latest/download/stockeao.apk`, que siempre
baja la última versión publicada.

> Los APK van en GitHub Releases y no en Supabase porque pesan ~70 MB y el plan gratuito de
> Supabase acepta hasta 50 MB por archivo. La página de descarga vive en `docs/descargar/` y
> se publica copiándola a la carpeta `stockeao/` del repo `grimorio-labs-landing`.

## 3. Respaldo semanal de la base de datos

El plan gratuito de Supabase no hace respaldos automáticos. El workflow **Respaldo de la base
de datos** copia todos los datos de Stockeao cada domingo y guarda el archivo 90 días en
GitHub (Actions → la ejecución → Artifacts).

Como el repositorio es público y cualquiera con cuenta de GitHub puede descargar los
artifacts, el respaldo se **cifra con age** antes de subirlo: solo se abre con tu clave
privada.

**Una sola vez:** crea el secreto `SUPABASE_DB_URL` con la cadena de conexión:
Supabase → botón **Connect** (arriba) → **Session pooler** → copia la URI y reemplaza
`[YOUR-PASSWORD]` por la contraseña de la base de datos. Usa la del _pooler_: la conexión
directa no funciona desde GitHub.

**Una sola vez, la clave de cifrado** (en tu computador con Windows):

1. Instala age: `winget install FiloSottile.age`
2. Genera el par de claves: `age-keygen -o stockeao-respaldo.key`. Imprime la clave pública
   (empieza por `age1…`).
3. Guarda el archivo `stockeao-respaldo.key` **fuera del repositorio** y en un lugar seguro.
   Si se pierde, los respaldos no se pueden abrir. Conviene una copia en un gestor de
   contraseñas o en un pendrive.
4. En GitHub → Settings → Secrets and variables → Actions → **Variables** → crea
   `RESPALDO_CLAVE_PUBLICA` con la clave `age1…` del paso 2.

Sin esa variable el workflow falla y no sube nada (nunca sube un respaldo sin cifrar).

Para probarlo: Actions → Respaldo de la base de datos → Run workflow.

Restaurar (solo si hace falta, idealmente con ayuda): descargar el respaldo
`respaldo-stockeao-AAAA-MM-DD.sql.gz.age`, abrirlo con tu clave:

```powershell
age --decrypt -i stockeao-respaldo.key -o respaldo.sql.gz respaldo-stockeao-AAAA-MM-DD.sql.gz.age
```

(Usa `-o` para el archivo de salida: en PowerShell, redirigir con `>` guarda el resultado como texto y
corrompe el respaldo.)

luego descomprimir el `.sql.gz` y ejecutarlo con `psql` sobre un proyecto vacío que ya tenga
aplicadas las migraciones.

Además, cada dueño puede descargar sus datos desde **Más → Exportar datos**.

## 4. Incorporar un local al piloto

1. Instala la app desde el enlace fijo del APK (paso 2) o pásale el archivo.
2. El dueño crea su cuenta y negocio en el teléfono principal (14 días de prueba).
3. Carga del catálogo: importar desde Excel (Inventario → Importar) o escaneando productos.
4. Agrega a los cajeros (Más → Usuarios y cajeros) con su PIN.
5. Instala la app en los otros teléfonos e inicia sesión con la misma cuenta.
6. Primer día: abrir caja, vender, cerrar caja. Revisa con el dueño que el cierre cuadre.
7. Pídeles que usen **Más → Enviar comentario o problema** para todo lo que noten.

## 5. Seguimiento

- **Más → Administración:** estado de cada cliente, última conexión y teléfonos.
- **Administración → Comentarios y errores:** lo que envían los clientes y los errores que
  la app informa sola (con versión y modelo de teléfono).
- Al terminar la prueba: registra el pago en Administración o extiende la prueba.
