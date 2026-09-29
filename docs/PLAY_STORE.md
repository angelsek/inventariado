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
3. **El nombre del paquete es para siempre:** `cl.inventariado.app`. El nombre visible de la
   app sí se puede cambiar después.
4. **Pagos:** Google no permite que una app indique formas de pago fuera de Play (transferencia,
   WhatsApp para pagar) para desbloquear funciones. Por eso la versión de Play **no muestra
   precios ni cómo pagar**: el cliente contrata y paga contigo por fuera, y la app solo se usa
   con la cuenta. La versión APK directa sigue mostrando esa información. Si más adelante
   quieres cobrar dentro de la app, habría que usar la facturación de Google Play (Google cobra
   una comisión de 15 %).

## Archivos que ya están listos

| Qué                                                     | Dónde                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| Ícono de la tienda (512×512)                            | `docs/play-store/icono-512.png`                                     |
| Imagen destacada (1024×500)                             | `docs/play-store/grafico-destacado-1024x500.png`                    |
| Páginas de privacidad, términos y eliminación de cuenta | `docs/legal-web/` (hay que publicarlas, ver abajo)                  |
| App Bundle (.aab)                                       | Actions → **Construir para Google Play** → Run workflow → Artifacts |

Para regenerar el ícono: `python3 scripts/generar-iconos.py`.
Para regenerar las páginas con tu correo:
`CONTACTO_CORREO=tu@correo.cl node --experimental-strip-types scripts/generar-legal.mjs`.

## Paso 1: páginas legales (publicadas)

Están en el repositorio público `angelsek/inventariado-legal`, con GitHub Pages:

- Política de privacidad: https://angelsek.github.io/inventariado-legal/privacidad.html
- Eliminar cuenta y datos: https://angelsek.github.io/inventariado-legal/eliminar-cuenta.html
- Términos: https://angelsek.github.io/inventariado-legal/terminos.html

Para actualizarlas: regenera con el comando de arriba y copia los archivos de
`docs/legal-web/` a ese repositorio.

## Paso 2: crear la app en Play Console

**Crear app**:

- Nombre de la app: `Inventariado: ventas y stock`
- Idioma predeterminado: Español (Latinoamérica) – es-419
- App o juego: **App**
- Gratis o pagada: **Gratis** (la suscripción se contrata fuera de Play)
- Aceptar las declaraciones.

## Paso 3: ficha de Play Store (Presencia en Play Store → Ficha principal)

**Nombre de la app** (máx. 30): `Inventariado: ventas y stock`

**Descripción breve** (máx. 80):

```
Vende, controla stock y cuadra la caja de tu almacén o botillería, sin internet.
```

**Descripción completa**:

```
Inventariado es el punto de venta y control de inventario pensado para almacenes, botillerías y minimarkets de Chile.

VENDE RÁPIDO
• Escanea los productos con la cámara del teléfono, uno tras otro, sin lector externo.
• Carrito con cantidades, descuentos y productos por kilo.
• Cobra en efectivo (con cálculo de vuelto), débito, crédito o transferencia, o combinando medios de pago.
• Comparte el comprobante por WhatsApp.

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

VARIOS TELÉFONOS, SIN INTERNET
• Todos los teléfonos del local comparten productos, ventas y stock.
• Funciona sin conexión y se sincroniza cuando vuelve internet.
• Cada cajero entra con su PIN; solo el dueño ve los costos y puede anular ventas.

TUS DATOS SON TUYOS
• Exporta productos y ventas a Excel cuando quieras.
• Elimina tu cuenta y todos tus datos desde la misma app.

Prueba gratis por 14 días. Inventariado no emite boletas electrónicas: los comprobantes son internos.
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

**Eliminación de cuentas**: URL de `eliminar-cuenta.html`.

## Paso 5: prueba interna y prueba cerrada

1. En GitHub: **Actions → Construir para Google Play → Run workflow** (pista _internal_).
   Descarga el `.aab` desde Artifacts.
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

## Paso 6 (opcional): subir automáticamente desde GitHub

Cuando la app ya exista en Play Console, puedes evitar la subida manual:

1. Play Console → **Configuración → Acceso a la API** → vincular un proyecto de Google Cloud y
   crear una **cuenta de servicio**; descarga su clave JSON.
2. En Play Console → **Usuarios y permisos** → invita el correo de la cuenta de servicio con
   permiso para publicar versiones en esta app.
3. En GitHub crea el secreto `PLAY_SERVICE_ACCOUNT_JSON` con el contenido completo del JSON.
4. Desde ahí, **Construir para Google Play** sube el `.aab` a la pista que elijas (producción
   queda como borrador para que la revises antes de publicar).

## Cada versión nueva

1. Sube `version` en `app.json` si es un cambio visible (ej. 1.0.0 → 1.1.0); el número interno
   de versión sube solo en cada compilación.
2. Actions → **Construir para Google Play** → Run workflow, con las novedades.
3. Si no configuraste el paso 6: sube el `.aab` en Play Console.
