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
desde tu Supabase.

**Una sola vez:** crea el secreto `SUPABASE_SERVICE_ROLE_KEY` con la clave **secreta** del
proyecto (Supabase → Project Settings → API Keys → _secret key_ o la antigua _service_role_).
Esta clave nunca va dentro de la app; solo la usa GitHub para subir el APK.

**Cada vez que quieras publicar:**

1. GitHub → **Actions → Construir APK → Run workflow**.
2. Elige la rama, marca **"Publicar para los clientes"** y escribe las novedades (opcional).
   Marca **"Actualización obligatoria"** solo si la versión anterior tiene un problema grave.
3. Al terminar (~15 min), las apps de los clientes muestran "Hay una versión nueva" y al
   tocarlo se descarga el APK.

El enlace fijo `https://<tu-proyecto>.supabase.co/storage/v1/object/public/apk/stockeao.apk`
siempre descarga la última versión publicada: sirve para instalar la app en un teléfono nuevo.

> El plan gratuito de Supabase tiene 1 GB de almacenamiento compartido con tu otra app y
> 50 MB por archivo (cada APK pesa ~41 MB). Borra de vez en cuando los APK antiguos en
> Storage → apk, dejando `stockeao.apk` y el último.

## 3. Respaldo semanal de la base de datos

El plan gratuito de Supabase no hace respaldos automáticos. El workflow **Respaldo de la base
de datos** copia todos los datos de Stockeao cada domingo y guarda el archivo 90 días en
GitHub (Actions → la ejecución → Artifacts).

**Una sola vez:** crea el secreto `SUPABASE_DB_URL` con la cadena de conexión:
Supabase → botón **Connect** (arriba) → **Session pooler** → copia la URI y reemplaza
`[YOUR-PASSWORD]` por la contraseña de la base de datos. Usa la del _pooler_: la conexión
directa no funciona desde GitHub.

Para probarlo: Actions → Respaldo de la base de datos → Run workflow.

Restaurar (solo si hace falta, idealmente con ayuda): descomprimir el `.sql.gz` y ejecutarlo
con `psql` sobre un proyecto vacío que ya tenga aplicadas las migraciones.

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
