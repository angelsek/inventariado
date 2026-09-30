# Estado actual del proyecto (para retomar)

Última actualización: 1 de octubre de 2026.

## Qué es

**Stockeao**: app Android de ventas, stock y caja para negocios de barrio de Chile (almacenes,
botillerías, kioskos, bazares). Varios teléfonos por negocio, funciona sin internet y
sincroniza con Supabase. Suscripción mensual: Básico $9.990 y Pro $14.990.

- Paquete Android: `cl.stockeao.app` (definitivo, ya está en Play Console).
- Rama de trabajo: `claude/fervent-franklin-regzl4` (todavía no se une a `main`).
- Supabase: proyecto compartido con otra app; todo en el esquema `inventariado`.
- Correo de contacto público: grimorio.labs@gmail.com.
- Páginas legales: repositorio `angelsek/inventariado-legal` (GitHub Pages).

## Hecho

- Fases 0 a 8 del plan (`docs/PLAN_DESARROLLO.md`): catálogo, ventas, caja, compras, conteo,
  suscripciones, piloto, reportes, fiado, envases, packs, promociones, alcohol.
- Escáner que solo lee dentro del rectángulo y valida el dígito verificador.
- Diseño simple y grande para personas adultas (pantalla de Inicio, botón Vender al centro).
- Barra inferior respeta los botones de sistema de cada teléfono.
- Firma con clave propia; app creada en Play Console con **prueba interna** (se subió la 1001;
  la 1002 y 1003 traen el diseño nuevo y el arreglo de la barra).
- Cobro con **Google Play Billing** programado (versión 1004): pantalla "Elige tu plan",
  funciones de Supabase `verificar-compra-play` y `notificaciones-play`, SQL
  `20261001000100_suscripcion_google_play.sql`.

## Pendiente (en orden)

1. Subir el `.aab` 1004 a prueba interna (Actions → Construir para Google Play → run 4).
2. Configurar el cobro siguiendo `docs/COBRO_GOOGLE_PLAY.md`: perfil de pagos, suscripciones
   `stockeao_basico` / `stockeao_pro` con oferta `prueba-14-dias`, cuenta de servicio, secretos
   de GitHub (`SUPABASE_ACCESS_TOKEN`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `PLAY_RTDN_TOKEN`),
   ejecutar el SQL, Pub/Sub y pruebas de licencias. Luego una compra de prueba real.
3. Ficha de Play Store: capturas de pantalla y reemplazar ícono y gráfico por los verdes
   (`docs/play-store/`). Formularios de contenido según `docs/PLAY_STORE.md`.
4. Cuenta demo para los revisores de Google (con plan activo, desde Más → Administración).
5. Prueba cerrada con 12 probadores por 14 días, si la cuenta de desarrollador es personal.
6. Más adelante: fotos de productos, conexión con terminales POS, unir la rama a `main`.

## Convenciones

Ver `AGENTS.md`: español de Chile, montos en CLP sin decimales, migraciones que nunca se
editan (se agregan nuevas), `npm run check` antes de terminar, pruebas fuera de `src/app/`.
