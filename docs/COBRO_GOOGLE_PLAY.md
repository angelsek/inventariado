# Cobro de la suscripción con Google Play

La versión de Play cobra la suscripción con la tarjeta de la cuenta de Google del cliente,
como Lightroom o Spotify: **14 días gratis** y después **Básico $9.990** o **Pro $14.990** al
mes, hasta que el cliente cancele desde Play Store. Google se queda con el 15 % y te deposita
una vez al mes.

## Cómo funciona

1. Un negocio nuevo (o que nunca ha pagado) entra a la app y ve **"Elige tu plan"**.
2. El dueño toca **"Probar 14 días gratis"** → ventana de pago de Google → confirma.
3. La app manda la compra a la función `verificar-compra-play` de Supabase, que la confirma
   con Google y deja el negocio **pagado hasta** la fecha que dice Google (durante la prueba,
   el fin de la prueba). Todos los teléfonos del negocio quedan activos.
4. Cada renovación, cancelación, pago fallido o reembolso llega a `notificaciones-play`
   (avisos de Google por Pub/Sub) y actualiza la fecha. Si el cliente cancela, la app sigue
   hasta el fin del período pagado y después aparecen los avisos de siempre (gracia y solo
   lectura).
5. Los cajeros no pueden comprar: ven "Pídele al dueño que active un plan".

La versión APK directa (fuera de Play) no puede usar el cobro de Google: sigue el pago manual
con el panel de administración.

## Lo que hay que configurar (una sola vez)

### 1. Perfil de pagos (Play Console)

**Monetizar con Play → Perfil de pagos** (o Configuración → Perfil de pagos): datos personales
o de tu empresa y **cuenta bancaria** donde Google deposita. Sin esto no se pueden crear
suscripciones.

### 2. Subir el App Bundle con cobro

Las suscripciones solo se pueden crear después de subir un `.aab` que incluya la librería de
cobro (desde la versión 1004). Súbelo a **Prueba interna** como siempre.

### 3. Crear las suscripciones (Play Console → Monetizar con Play → Productos → Suscripciones)

Para cada plan:

|                                                   | Básico            | Pro               |
| ------------------------------------------------- | ----------------- | ----------------- |
| **ID del producto** (exacto, no se puede cambiar) | `stockeao_basico` | `stockeao_pro`    |
| Nombre                                            | Stockeao Básico   | Stockeao Pro      |
| Beneficios                                        | Hasta 2 teléfonos | Hasta 5 teléfonos |

Dentro de cada suscripción:

1. **Agregar plan básico**: ID `mensual`, tipo **Renovación automática**, período **1 mes**,
   período de gracia 7 días. Precio: **Chile CLP 9.990** (o 14.990). Para los demás países,
   deja que Google convierta. **Activar**.
2. **Agregar oferta** en ese plan: ID `prueba-14-dias`, elegibilidad **Adquisición de clientes
   nuevos → "Nunca tuvo ninguna suscripción"** (así no pueden encadenar la prueba de Básico y
   luego la de Pro). Fase: **Prueba gratuita, 14 días**. **Activar**.

### 4. Cuenta de servicio (para que Supabase verifique las compras)

1. Entra a [console.cloud.google.com](https://console.cloud.google.com), crea un proyecto
   (ej. "stockeao") y activa **Google Play Android Developer API** (APIs y servicios →
   Biblioteca).
2. **IAM y administración → Cuentas de servicio → Crear**: nombre "stockeao-play", sin roles.
   Entra a la cuenta creada → **Claves → Agregar clave → JSON**. Se descarga un archivo:
   guárdalo bien, es una contraseña.
3. En Play Console: **Usuarios y permisos → Invitar usuarios** → el correo de la cuenta de
   servicio (termina en `iam.gserviceaccount.com`) → permisos de la app Stockeao: **Ver
   información de la app**, **Ver información financiera** y **Administrar pedidos y
   suscripciones** → Invitar.

(Los permisos pueden tardar hasta 24 horas en funcionar.)

### 5. Secretos en GitHub (Settings → Secrets and variables → Actions → New repository secret)

| Secreto                            | Valor                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`            | Supabase → tu avatar → **Account preferences → Access Tokens → Generate new token** |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Todo el contenido del archivo JSON del paso 4                                       |
| `PLAY_RTDN_TOKEN`                  | Un texto secreto inventado, largo y sin espacios (ej. `rtdn-8f3k2m9x7q`)            |

Luego **Actions → Publicar funciones de Supabase → Run workflow**. Publica las dos funciones
y les carga los secretos.

### 6. SQL en Supabase

Ejecuta `supabase/migrations/20261001000100_suscripcion_google_play.sql` como los anteriores.
Si en **Data API** aparece la lista de funciones expuestas, activa `aplicar_compra_play`.

### 7. Avisos de Google (renovaciones y cancelaciones)

1. En Google Cloud (mismo proyecto): **Pub/Sub → Temas → Crear tema** `stockeao-play`.
2. En el tema → **Permisos → Agregar principal**:
   `google-play-developer-notifications@system.gserviceaccount.com` con el rol
   **Publicador de Pub/Sub**.
3. En el tema → **Crear suscripción**: tipo **Push**, URL:
   `https://jihymoqpvsizcnrpckja.supabase.co/functions/v1/notificaciones-play?token=<PLAY_RTDN_TOKEN>`
   (con el mismo texto del secreto).
4. En Play Console: **Monetizar con Play → Configuración de la monetización → Notificaciones
   en tiempo real para desarrolladores**: nombre del tema
   `projects/<id-del-proyecto>/topics/stockeao-play` → **Enviar mensaje de prueba** → Guardar.

### 8. Probar sin pagar

Play Console → **Configuración → Pruebas de licencias**: agrega tu correo de Google (y el de
quien pruebe). Con esas cuentas las compras son de prueba: no se cobra nada y la suscripción se
renueva cada pocos minutos, para ver renovaciones y cancelaciones rápido.

### 9. Cuenta demo para los revisores de Google

Como la app pide elegir plan, la cuenta demo necesita un plan activo: en **Más →
Administración**, registra un pago de varios meses para el negocio demo.

## Negocios que ya existen

- Si pagaban por transferencia y tienen "pagado hasta" vigente, siguen igual. Cuando venza,
  en la versión de Play pueden suscribirse con Google.
- Un negocio en prueba sin tarjeta (creado antes) verá "Elige tu plan" al actualizar a la
  versión de Play.
