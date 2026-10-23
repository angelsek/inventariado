# Estado actual del proyecto (para retomar)

Última actualización: 23 de octubre de 2026.

## Qué es

**Stockeao**: app Android de ventas, stock y caja para negocios de barrio de Chile (almacenes,
botillerías, kioskos, bazares). Varios teléfonos por negocio, funciona sin internet y
sincroniza con Supabase. Precios (con IVA incluido, pensados para reinvertir en Grimorio Labs):

| Plan   | Mensual | Anual (12 por 10) | Equipos |
| ------ | ------- | ----------------- | ------- |
| Básico | $9.990  | $99.900           | 2       |
| Pro    | $14.990 | $149.900          | 5       |

- Paquete Android: `cl.stockeao.app` (definitivo, ya está en Play Console).
- Rama principal: `main` (la rama `claude/fervent-franklin-regzl4` ya se fusionó y se borró).
- Supabase: proyecto compartido con otra app; todo en el esquema `inventariado`.
- Contacto: contacto@grimoriolabs.com (página) · WhatsApp +56 9 5470 0498 (variable
  `CONTACTO_WHATSAPP`).
- Páginas legales: repositorio `angelsek/inventariado-legal` (GitHub Pages).
- Empresa: **Grimorio Labs SpA**, formalizada y con inicio de actividades en el SII (octubre de
  2026).

## Cómo se cobra hoy

**Se cobra por transferencia con la versión APK** (fuera de Play Store). El cobro con Google Play
está programado pero en pausa hasta que la SpA tenga una cuenta bancaria con código SWIFT (ver
Pendiente). Conviene que cada pago llegue a una cuenta de la SpA y se emita boleta o factura: ese
historial de facturación es lo que piden los bancos para abrir la cuenta.

- Instalar: **https://grimoriolabs.com/stockeao/** (fuente en `docs/descargar/`, se publica en
  la carpeta `stockeao/` del repo `grimorio-labs-landing`). Si Chrome se queda pegado al bajar el
  APK, mandarlo por WhatsApp como documento.
- Publicar versión (solo desde `main`): Actions → **Construir APK** → Run workflow → marcar
  **Publicar**, o subir un tag `vX.Y.Z` que coincida con `expo.version` (`docs/PILOTO.md`). Queda como
  Release de GitHub (el APK pesa ~70 MB; Supabase gratis acepta 50 MB) y las apps muestran
  "Hay una versión nueva → Actualizar", que descarga e instala con un toque.
- El cliente toca "Escribir por WhatsApp", se le dan los datos para transferir en el chat (no van
  en la app) y el pago se registra en Más →
  Administración (1 mes, 3, 6 o 1 año).
- El teléfono se reconoce aunque se reinstale la app (id derivado del ANDROID_ID).

## Hecho

- Fases 0 a 8 del plan (`docs/PLAN_DESARROLLO.md`): catálogo, ventas, caja, compras, conteo,
  suscripciones, piloto, reportes, fiado, envases, packs, promociones, alcohol.
- Escáner que solo lee dentro del rectángulo y valida el dígito verificador.
- Diseño simple y grande para personas adultas (pantalla de Inicio, botón Vender al centro);
  botón flotante "Nuevo producto" en Productos.
- Firma con clave propia; app en Play Console con **prueba interna** (último `.aab` compilado:
  1015, desde `main`, run 39099334938; aún no subido).
- Cobro con Google Play Billing programado (en pausa) y **perfil de pagos de Grimorio Labs SpA**
  creado en Play Console (le falta la cuenta bancaria).
- APK publicado (versión 35) con actualización dentro de la app y página de descarga.
- Integridad del APK: la app solo descarga de las Releases y verifica el SHA-256 (publicado en
  Supabase) antes de instalar; el workflow lo calcula, lo registra y sube `stockeao.apk.sha256`
  (`docs/PILOTO.md`).
- Desarrollo local en Windows con emulador (`docs/TRABAJAR_EN_MI_EQUIPO.md`).
- Versión web para PC, fase 1 (rama `feat/version-escritorio`): Stockeao en Chrome/Edge, sin
  internet, con menú lateral y caja (POS) con atajos y pistola USB. Un PC ocupa un cupo como un
  teléfono. Detalle en `docs/WEB.md`.
- Logo nuevo "cajas en S" (rama `feat/logo-cajas`): fuentes SVG y reglas en `assets/marca/LEEME.md`;
  los PNG se regeneran con `npm run iconos:generar`. Ya está dentro de la app y la web.
- Permisos por persona (rama `feat/permisos-por-persona`): el dueño elige con interruptores qué
  puede hacer cada persona en Más → Usuarios y permisos (15 permisos aplicados en rutas, menús y
  botones, reglas contra la escalada de permisos, bloqueo del PIN tras intentos fallidos). Reemplaza
  a los roles. Detalle y límites de seguridad en `docs/PERMISOS.md`.
- Stockeao en grimoriolabs.com (PR #6 de `grimorio-labs-landing`): primera ficha de la portada,
  con rasgos, planes y precios, 7 días gratis, botón a `stockeao/`, contacto y legales, en español
  e inglés. La página de descarga ya tiene el ícono nuevo. Los precios están escritos a mano en
  `public/index.html` y `public/js/landing.js` de ese repo: si cambian, hay que tocarlos ahí.
- Exportar a Excel solo con el plan pagado (rama `feat/importar-exportar-solo-pagado`): los CSV de
  productos y de ventas (Más → Exportar datos) y el CSV «Exportar a Excel» de Reportes solo
  funcionan con la suscripción pagada y al día (estado `activa`). Durante la prueba gratis, los 7
  días de gracia y la suspensión se ven con candado y la pantalla ofrece «Ver planes». Importar
  productos no se bloquea (así un cliente nuevo evalúa la app con su propio catálogo) y el respaldo
  completo (JSON) está siempre disponible (Términos §8). Es una regla de producto, no una frontera
  de seguridad. Decisiones y límites en `docs/PERMISOS.md` (sección «Exportar y el plan pagado»).
- Páginas legales: `docs/legal-web/*.html` se genera con `scripts/generar-legal.mjs` y estaba
  atrasado; se regeneró (ver Pendiente para publicarlo).
- Dependencias revisadas: el workflow **Dependencias** corre `npm audit` contra las excepciones
  registradas (estricto en PR que tocan dependencias y los lunes; no obligatorio). Las
  vulnerabilidades actuales están analizadas en `docs/SEGURIDAD_DEPENDENCIAS.md`.
- Prueba gratis de 7 días (antes 14), igual que en grimoriolabs.com: migración ejecutada en
  Supabase y páginas legales publicadas. Los APK ya instalados dicen 14 días hasta la próxima
  versión publicada.

## Pendiente (en orden)

1. **Antes de fusionar el PR de permisos por persona y de publicar el APK o la web:** ejecutar
   `supabase/migrations/20261021000100_permisos_por_persona.sql` en el SQL Editor de Supabase
   (`docs/SUPABASE.md`); la web se publica sola desde `main`, y si falta la migración la
   sincronización falla (columna `permisos` desconocida). Las migraciones de roles ya se
   ejecutaron. Detalle en `docs/PERMISOS.md`.
2. **Antes de la primera publicación con la verificación:** ejecutar
   `supabase/migrations/20261003000100_versiones_app_sha256.sql` en el SQL Editor de Supabase
   (`docs/SUPABASE.md`) y publicar solo después de fusionar `feat/integridad-apk` a `main`.
3. **Antes de publicar la web** (`docs/WEB.md`): ejecutar
   `supabase/migrations/20261018000100_dispositivos_tipo.sql` en Supabase; en Cloudflare
   (proyecto `stockeao-web`, Workers con integración de Git) configurar el build, las variables y
   el dominio `stockeao.grimoriolabs.com` (tablas en `docs/WEB.md`); si se usan enlaces de correo
   de Supabase Auth, agregar el dominio a las URL permitidas.
   Verificar en Chrome/Edge reales que F11 y F12 las capture la caja.
4. **Logo nuevo, pasos manuales** (el ícono ya está en grimoriolabs.com): subir
   `docs/play-store/icono-512.png` y el gráfico destacado en Play Console; publicar una versión
   APK para que los clientes vean el ícono nuevo (los íconos no cambian por OTA); revisar en el
   emulador el ícono adaptable (máscaras circular y squircle), el ícono temático y el splash de
   Android 12+; actualizar el flyer (`docs/flyer`, fuera de git y ahora en `.gitignore`) con
   el ícono nuevo y con los 7 días de prueba (hoy dice 14).
5. Versión web, fases 2 a 5: caja y ventas; catálogo; inventario y clientes; gestión, respaldo y
   documentación (hoy esas pantallas se ven con el diseño del teléfono).
6. Revisar los textos legales: la política de privacidad debe decir que los datos se guardan en
   el navegador del PC, y los textos que hablan de "teléfonos" deben hablar de "equipos".
7. **Publicar las páginas legales** (paso manual): `docs/legal-web/*.html` se genera con
   `scripts/generar-legal.mjs` y estaba atrasado respecto de la app; ya está regenerado en este
   repo, pero falta copiarlo al repositorio `angelsek/inventariado-legal` (GitHub Pages) con un PR
   (usar `GH_TOKEN` de angelsek) para que las URL públicas lo muestren (`docs/PLAY_STORE.md`).
8. **Limitar la prueba gratis a una por dispositivo, correo o RUT, en el servidor.** Exportar a
   Excel solo con plan pagado no cierra del todo el ciclo «exporto al terminar la prueba → creo
   otra cuenta → importo → prueba nueva»: quien guarde su propio CSV puede volver a importarlo
   (importar no se bloquea a propósito). Lo que de verdad lo cierra es esta limitación; sigue
   pendiente.
9. Cobro con Google Play (en pausa): Google paga a Chile por transferencia internacional y exige
   código SWIFT/BIC. Mercado Pago no tiene, y los bancos que sí tienen piden historial de
   facturación a la SpA. Con la cuenta abierta: agregarla al perfil de pagos y seguir desde el
   paso 2 de `docs/COBRO_GOOGLE_PLAY.md` (subir el `.aab`, suscripciones, cuenta de servicio,
   secretos, SQL, Pub/Sub, pruebas de licencias). Al crear la oferta en Play Console, usar
   `prueba-7-dias` (7 días). El `.aab` 1015 ya compilado tiene los textos de 14 días: hay que
   compilar uno nuevo antes de subirlo. Después: ficha de Play Store, cuenta demo y,
   si la cuenta de desarrollador es personal, prueba cerrada de 12 probadores por 14 días.
10. **Boletas y facturas electrónicas (DTE)** (plan aún sin aprobar): servicio extra que se cobra
    aparte del plan. Grimorio Labs paga el certificado y le cobra al negocio un delta sobre su
    costo. Se están cotizando OpenFactura (Haulmer) y SimpleAPI; el piloto será certificar el RUT
    de Grimorio Labs. Ojo: los clientes que cobran con la POS de Mercado Pago ya reciben boleta de
    la máquina, así que hay que evitar emitir una segunda boleta por la misma venta.
11. Más adelante: fotos de productos, unir la rama a `main` y **conexión con terminales POS**
    (ver abajo).
12. Limpieza menor: borrar en Supabase la tabla `roles`, `perfiles.rol_id` y sus triggers
    (migraciones `20261019000100` y `20261020000100`), que quedaron sin uso (`docs/PERMISOS.md`).

## Idea a futuro: cobrar con la máquina POS desde Stockeao

La venta se arma en Stockeao y, al elegir **débito o crédito**, Stockeao le manda el monto a la
máquina POS del negocio; en la máquina solo aparece el total a pagar, el cliente pasa su tarjeta
y la máquina le responde a Stockeao si se aprobó, para cerrar la venta sola.

Puntos a revisar cuando se haga:

- Qué máquinas usan los negocios objetivo (Transbank, Getnet, Mercado Pago Point, SumUp, Tuu)
  y cuáles ofrecen **integración**: por nube (la app pide el cobro a una API y la máquina lo
  recibe) o local (Bluetooth/USB con un SDK).
- Cada proveedor exige convenio o credenciales de integración; algunos solo con empresa
  formalizada.
- En la app: un medio de pago "Tarjeta (POS)" que deja la venta pendiente hasta la respuesta,
  con opción de reintentar o cobrar a mano si la máquina no responde (la app funciona sin
  internet).
- Podría ser parte del plan Pro o de un plan superior.

## Convenciones

Ver `AGENTS.md`: español de Chile, montos en CLP sin decimales, migraciones que nunca se
editan (se agregan nuevas), `npm run check` antes de terminar, pruebas fuera de `src/app/`.
