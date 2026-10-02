# Estado actual del proyecto (para retomar)

Última actualización: 2 de octubre de 2026.

## Qué es

**Stockeao**: app Android de ventas, stock y caja para negocios de barrio de Chile (almacenes,
botillerías, kioskos, bazares). Varios teléfonos por negocio, funciona sin internet y
sincroniza con Supabase. Precios (con IVA incluido, pensados para reinvertir en Grimorio Labs):

| Plan   | Mensual | Anual (12 por 10) | Teléfonos |
| ------ | ------- | ----------------- | --------- |
| Básico | $9.990  | $99.900           | 2         |
| Pro    | $14.990 | $149.900          | 5         |

- Paquete Android: `cl.stockeao.app` (definitivo, ya está en Play Console).
- Rama de trabajo: `claude/fervent-franklin-regzl4` (todavía no se une a `main`).
- Supabase: proyecto compartido con otra app; todo en el esquema `inventariado`.
- Contacto: contacto@grimoriolabs.com (página) · WhatsApp +56 9 5470 0498 (variable
  `CONTACTO_WHATSAPP`).
- Páginas legales: repositorio `angelsek/inventariado-legal` (GitHub Pages).

## Cómo se cobra hoy

Mientras no se formalice la empresa, **se cobra por transferencia con la versión APK** (fuera de
Play Store). El cobro con Google Play queda programado pero en pausa (`docs/COBRO_GOOGLE_PLAY.md`).

- Instalar: **https://grimoriolabs.com/stockeao/** (fuente en `docs/descargar/`, se publica en
  la carpeta `stockeao/` del repo `grimorio-labs-landing`). Si Chrome se queda pegado al bajar el
  APK, mandarlo por WhatsApp como documento.
- Publicar versión: Actions → **Construir APK** → Run workflow → marcar **Publicar**. Queda como
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
- Firma con clave propia; app en Play Console con **prueba interna** (último `.aab`: 1008).
- Cobro con Google Play Billing programado (en pausa).
- APK publicado (versión 35) con actualización dentro de la app y página de descarga.
- Desarrollo local en Windows con emulador (`docs/TRABAJAR_EN_MI_EQUIPO.md`).

## Pendiente (en orden)

1. Cuando se formalice la empresa: retomar el cobro con Google Play (`docs/COBRO_GOOGLE_PLAY.md`),
   ficha de Play Store, cuenta demo y prueba cerrada.
2. Más adelante: fotos de productos, unir la rama a `main` y **conexión con terminales POS**
   (ver abajo).

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
