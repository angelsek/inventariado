# Publicar en Google Play

Todo lo que pide Play Console, en orden, con los textos listos para copiar.

## Antes de empezar: 4 cosas importantes

1. **Prueba cerrada obligatoria (cuentas personales nuevas).** Si tu cuenta de desarrollador
   es **personal** y se creó después de noviembre de 2023, Google exige una **prueba cerrada
   con al menos 12 personas durante 14 días seguidos** antes de poder publicar en producción.
   Los locales del piloto, sus cajeros, amigos y familia sirven como probadores (necesitan una
   cuenta de Google cada uno). Las cuentas de **organización** (empresa con D-U-N-S) no tienen
   este requisito.
2. **Clave de firma propia.** Play rechaza archivos firmados con la clave de desarrollo. Crea
   la clave como indica `docs/PILOTO.md` (sección 1) **antes** de la primera subida. Esa clave
   será tu _clave de subida_; Google guarda aparte la clave con que firma la app final
   ("Firma de apps de Play", viene activada por defecto: acéptala).
3. **El nombre del paquete es para siempre:** `cl.stockeao.app`. El nombre visible de la
   app sí se puede cambiar después.
4. **Pagos:** la versión de Play cobra la suscripción con **Google Play Billing** (Básico
   $9.990 y Pro $14.990 al mes, 7 días gratis con tarjeta; Google cobra una comisión de 15 %).
   No muestra transferencias ni otras formas de pago externas (política de pagos de Google).
   La versión APK directa sigue con el pago manual. Configuración paso a paso:
   `docs/COBRO_GOOGLE_PLAY.md`.

## Archivos que ya están listos

| Qué                                                     | Dónde                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Ícono de la tienda (512×512)                            | `docs/play-store/icono-512.png`                                     |
| Imagen destacada (1024×500)                             | `docs/play-store/grafico-destacado-1024x500.png`                    |
| Páginas de privacidad, términos y eliminación de cuenta | `docs/legal-web/` (hay que publicarlas, ver abajo)                  |
| App Bundle (.aab)                                       | Actions → **Construir para Google Play** → Run workflow → Artifacts |

El `.aab` solo se genera a mano y únicamente desde la rama `main`.

Para regenerar el ícono y la imagen destacada: `npm run iconos:generar` (detalle en
`assets/marca/LEEME.md`).
Para regenerar las páginas con tu correo:
`CONTACTO_CORREO=tu@correo.cl node --experimental-strip-types scripts/generar-legal.mjs`.

## Paso 1: páginas legales (publicadas)

Están en el repositorio público `angelsek/inventariado-legal`, con GitHub Pages:

- Política de privacidad: https://angelsek.github.io/inventariado-legal/privacidad.html
- Eliminar cuenta y datos: https://angelsek.github.io/inventariado-legal/eliminar-cuenta.html
- Términos: https://angelsek.github.io/inventariado-legal/terminos.html

Para actualizarlas: regenera con el comando de arriba y copia los archivos de
`docs/legal-web/` a ese repositorio (paso manual: el PR en `angelsek/inventariado-legal` se abre
con el `GH_TOKEN` de angelsek). `docs/legal-web/*.html` se genera con `scripts/generar-legal.mjs`;
no se editan a mano, y si el texto de la app cambia hay que regenerarlas y volver a publicarlas.

## Paso 2: crear la app en Play Console

**Crear app**:

- Nombre de la app: `Stockeao: ventas y stock`
- Idioma predeterminado: Español (Latinoamérica) – es-419
- App o juego: **App**
- Gratis o pagada: **Gratis** (la suscripción se contrata fuera de Play)
- Aceptar las declaraciones.

## Paso 3: ficha de Play Store (Presencia en Play Store → Ficha principal)

**Nombre de la app** (máx. 30): `Stockeao: ventas y stock`

**Descripción breve** (máx. 80):

```
Vende, controla stock y cuadra la caja de tu negocio de barrio, sin internet.
```

**Descripción completa**:

```
Stockeao es el punto de venta y control de inventario pensado para almacenes, botillerías, kioskos, bazares y minimarkets de Chile.

VENDE RÁPIDO
• Escanea los productos con la cámara del teléfono, uno tras otro, sin lector externo.
• Carrito con cantidades, descuentos y productos por kilo.
• Cobra en efectivo (con cálculo de vuelto), débito, crédito o transferencia, o combinando medios de pago.
• Comparte el comprobante por WhatsApp.
• Fiado: lleva la cuenta de cada cliente, con límite y estado de cuenta por WhatsApp.
• Promociones "3 x $2.000", packs, envases retornables y venta a granel.

CONTROLA TU STOCK
• El stock se descuenta solo con cada venta.
• Registra el ingreso de mercadería de tus proveedores y actualiza costos.
• Ajustes por merma, rotura o vencimiento, con historial de quién hizo qué.
• Conteo de inventario escaneando y lista de productos por reponer.
• Carga tu catálogo desde Excel.

CUADRA LA CAJA
• Abre y cierra caja por turno, con ingresos y retiros de efectivo.
• La app te dice cuánto efectivo debería haber y si sobra o falta.
• Ventas del día por medio de pago.
• Reportes: ventas por día, hora, cajero y categoría, productos más vendidos y ganancia.

VARIOS TELÉFONOS, SIN INTERNET
• Todos los teléfonos del local comparten productos, ventas y stock.
• Funciona sin conexión y se sincroniza cuando vuelve internet.
• Cada cajero entra con su PIN; solo el dueño ve los costos y puede anular ventas.

TUS DATOS SON TUYOS
• Exporta productos y ventas a Excel con tu plan pagado, y descarga el respaldo completo cuando quieras.
• Elimina tu cuenta y todos tus datos desde la misma app.

Prueba gratis por 7 días. Stockeao no emite boletas electrónicas: los comprobantes son internos.
```

**Gráficos**:

- Ícono: `docs/play-store/icono-512.png`
- Imagen destacada: `docs/play-store/grafico-destacado-1024x500.png`
- **Capturas de teléfono (mínimo 2, ideal 4 a 8):** tómalas en tu teléfono (botón de encendido +
  bajar volumen) con datos de ejemplo que se vean bien:
  1. Vender con varios productos en el carrito.
  2. Cobrar mostrando el vuelto.
  3. Inventario con categorías y avisos de stock.
  4. Caja abierta con el efectivo esperado.
  5. Ficha de producto con precio, costo y ganancia.
  6. Ventas del día.

**Categoría**: Empresa (Business). **Etiquetas**: punto de venta, inventario.
**Correo de contacto**: el que quieras mostrar públicamente.

## Paso 4: contenido de la app (Política → Contenido de la app)

**Política de privacidad**: la URL de `privacidad.html` (paso 1).

**Acceso a la app**: _Toda o parte de la funcionalidad está restringida_ → agregar
instrucciones para los revisores. Antes crea en la app un negocio de demostración con algunos
productos, y escribe:

```
Correo: demo@<tu-dominio o gmail>
Contraseña: <contraseña de la cuenta demo>
Al abrir, elegir el usuario "Dueño Demo" e ingresar el PIN 1234.
```

(La cuenta demo necesita la suscripción activa: extiende su prueba desde Más → Administración.)

**Anuncios**: No, la app no contiene anuncios.

**Clasificación del contenido** (cuestionario IARC): categoría _Todas las demás apps_
(utilidades, productividad, comunicación). Responde **No** a violencia, sexualidad, lenguaje,
drogas, apuestas y contenido generado por usuarios compartido públicamente. La app no promueve
ni vende alcohol a consumidores: es una herramienta interna del comercio (si te preguntan por
referencias a alcohol, la respuesta honesta es que los usuarios pueden registrar productos con
esos nombres en su propio catálogo, que no es público).

**Público objetivo**: 18 años o más. No está dirigida a niños.

**App de noticias / de salud / gubernamental / financiera**: No.
(En _Funciones financieras_ elige "Mi app no ofrece ninguna de estas funciones": la app registra
ventas del comercio, pero no presta, transfiere ni procesa dinero.)

**Seguridad de los datos**:

| Pregunta                        | Respuesta                                         |
| ------------------------------- | ------------------------------------------------- |
| ¿Recopila o comparte datos?     | Sí, recopila. No comparte con terceros.           |
| ¿Datos encriptados en tránsito? | Sí                                                |
| ¿Se puede pedir la eliminación? | Sí (en la app y en la URL `eliminar-cuenta.html`) |

Datos recopilados (todos: _recopilados_, **no compartidos**, _obligatorios_, finalidad
_Funcionalidad de la app_ y _Administración de la cuenta_):

- **Información personal → Correo electrónico** (cuenta del negocio).
- **Información personal → Nombre** (nombre del dueño y de los cajeros).
- **Actividad en la app → Otro contenido generado por el usuario** (productos, ventas, cajas).
- **Información y rendimiento de la app → Registros de fallos y Diagnósticos** (errores que la
  app informa, con modelo de teléfono). Finalidad: _Análisis_.
- **Dispositivo u otros identificadores** (identificador del teléfono generado por la app para
  el límite de teléfonos del plan).
- **Retención tras eliminar la cuenta:** queda guardado un código SHA-256 calculado desde el
  correo, el RUT y el identificador del teléfono, con la fecha en que terminaba la prueba, para
  que la prueba gratis sea una por negocio. No lleva `negocio_id` y no se puede leer desde la app.
  Es un dato seudonimizado, no anónimo (`docs/PRUEBA_GRATIS.md`, sección Privacidad). Al
  responder el formulario, declara que parte de esos datos se conserva después de la eliminación
  y que la finalidad es _Prevención de fraude, seguridad y cumplimiento_. Debe coincidir con la
  Política de privacidad (§5) y con `eliminar-cuenta.html`.
- **Información financiera → Historial de compras** (plan contratado e identificador de la
  compra en Google Play). Finalidad: _Funcionalidad de la app_.
- **Información personal → Nombre** y **Teléfono** también incluyen a los clientes con fiado
  que registra el negocio.

**Eliminación de cuentas**: URL de `eliminar-cuenta.html`.

## Paso 5: prueba interna y prueba cerrada

1. En GitHub: **Actions → Construir para Google Play → Run workflow** (pista _internal_), con la
   casilla **subir** desmarcada: esta vez el `.aab` tiene que quedarse en Artifacts, porque Play
   exige que la primera versión se suba a mano. Descárgalo desde Artifacts.
2. Play Console → **Probar y publicar → Pruebas internas → Crear versión** → sube el `.aab`
   (la primera vez siempre a mano). Agrega tu correo como probador e instálala desde el
   enlace que te da Play.
3. **Prueba cerrada** (si tu cuenta es personal nueva): crea la pista, agrega los correos de
   al menos 12 probadores y comparte con ellos el enlace de participación. Deben instalarla y
   mantenerla 14 días. Luego podrás solicitar el acceso a producción.
4. **Producción**: sube la versión probada y envíala a revisión (suele tardar de 1 a 7 días).

> **Teléfonos con el APK directo:** la versión de Play la firma Google con otra clave, así que
> para pasar a la de Play hay que **desinstalar el APK una vez** (revisa antes que diga "Todo
> sincronizado"; los datos vuelven al iniciar sesión). Después, Play la actualiza sola.

## Paso 6: subir automáticamente desde GitHub (ya configurado)

Está hecho desde el 24 de octubre de 2026: el workflow **Construir para Google Play** compila el
`.aab` y lo sube solo a la pista que elijas (producción queda como borrador para que la revises
antes de publicar). No hay que bajar el archivo ni subirlo a mano.

> **La primera versión de una app siempre es manual.** La API de Google no puede crear la primera
> versión: hay que subir un `.aab` desde Play Console al menos una vez (paso 5). Para esa corrida,
> **desmarca la casilla `subir`** del workflow; si no, el intento falla y la ejecución queda en
> rojo. Recién después el workflow puede tomar las siguientes.

Lo que quedó configurado, por si hay que rehacerlo:

- Proyecto de Google Cloud `stockeao-play`, con la **Google Play Android Developer API** habilitada.
- Cuenta de servicio `subir-stockeao@stockeao-play.iam.gserviceaccount.com`, sin ningún rol de
  Google Cloud (los permisos se dan en Play Console).
- Secreto `PLAY_SERVICE_ACCOUNT_JSON` en GitHub con la clave JSON de esa cuenta. Es el único lugar
  donde vive la clave: el archivo descargado se borró.

### Cómo se hizo (el camino que funcionó)

En Play Console no aparece la página **Configuración → Acceso a la API** que nombran los
tutoriales; Google la movió y no está bajo "Configuración de las apps de Play" (ahí solo hay
"Configuración general" y "Configuración de monetización"). No hace falta: se arma desde Google
Cloud y se invita la cuenta como un usuario más.

1. En [console.cloud.google.com](https://console.cloud.google.com), con la cuenta dueña de Play
   Console: crear el proyecto (`stockeao-play`).
2. Buscar **Google Play Android Developer API** y **habilitarla** en ese proyecto. Sin esto, la
   subida falla aunque los permisos estén bien.
3. **IAM y administración → Cuentas de servicio → Crear cuenta de servicio**. Sin roles en los
   pasos 2 y 3.
4. En la cuenta creada: **Administrar claves → Agregar clave → Crear clave nueva → JSON**. Se
   descarga el archivo.
5. Play Console → **Usuarios y permisos → Invitar a usuarios nuevos**, con el correo de la cuenta
   de servicio.
6. En **Permisos de la app**, agregar Stockeao y marcar solo estos (nombres del formulario actual):
   - Ver la información de la app (solo lectura)
   - Ver información de calidad de la app (solo lectura) — se marca sola
   - Editar y eliminar apps en borrador
   - **Lanzar apps a los segmentos de pruebas** — es el que permite subir a `internal`, `alpha` y
     `beta`; sin él la subida falla con `The caller does not have permission`
7. Guardar la clave como secreto y borrar el archivo del disco:

   ```bash
   gh secret set PLAY_SERVICE_ACCOUNT_JSON < ruta/al/archivo.json
   rm ruta/al/archivo.json
   ```

### El permiso de producción está fuera a propósito

La cuenta de servicio **no** tiene "Lanzar a producción, excluir dispositivos y usar la firma de
apps de Play". Así, aunque alguien se robe el JSON, no puede publicar nada al público: lo peor que
logra es subir a una pista de prueba.

Cuando se quiera usar la pista `production` del workflow, hay que volver a Play Console →
**Usuarios y permisos** → la cuenta de servicio → **Permisos de la app** y marcarlo. Es un minuto.
Mientras no esté marcado, lanzar el workflow con `production` falla.

### Rotar la clave

Si la clave se filtra o se quiere renovar: en Google Cloud → **IAM y administración → Cuentas de
servicio → subir-stockeao → Administrar claves**, crear una clave nueva, correr
`gh secret set PLAY_SERVICE_ACCOUNT_JSON` con ella y recién ahí **borrar la clave vieja** desde esa
misma pantalla. La cuenta de servicio sigue siendo la misma, así que los permisos de Play Console
no se tocan.

## Cada versión nueva

1. Sube `version` en `app.json` si es un cambio visible (ej. 1.0.0 → 1.1.0); el número interno
   de versión sube solo en cada compilación.
2. Actions → **Construir para Google Play** → Run workflow, con la pista y las novedades, y la
   casilla **subir** marcada (viene marcada por defecto).
3. Listo: el workflow sube la versión a Play Console solo (paso 6). La subida a mano solo hizo
   falta para la primera versión de la app.
