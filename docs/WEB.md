# Versión web (PC)

Stockeao también corre en el navegador del computador (Chrome o Edge) en
**https://stockeao.grimoriolabs.com** (Cloudflare Workers). Funciona sin internet y sincroniza con
el mismo Supabase que la app Android. Tiene un front propio para PC, pensado para la caja: menú
lateral y una pantalla de venta con teclado y pistola lectora.

Fase 1 (hecha): base local en el navegador, menú lateral, caja (POS) de venta y cobro, y
funcionamiento sin internet. Las pantallas que aún no se rediseñan se ven con el diseño del
teléfono. Se rediseñan en las fases siguientes:

- Fase 2: caja y ventas.
- Fase 3: catálogo.
- Fase 4: inventario y clientes.
- Fase 5: gestión, respaldo y documentación.

## Cómo está armada

Es el mismo proyecto Expo; no hay una app aparte. Lo propio de la web va en variantes `.web.ts(x)`
que Expo elige solo al compilar para web:

- `src/app/(tabs)/_layout.web.tsx`: la navegación de PC.
- `src/app/(tabs)/vender.web.tsx`: apunta a `src/web/pantallas/VenderPos.tsx` (la caja).
- `src/web/componentes/MarcoApp.tsx` y `MarcoApp.web.tsx`: el marco de la app con menú lateral
  (en Android no se usa).
- `src/web/pos` (lógica de la caja) y `src/web/plataforma` (acceso a funciones del navegador).
- Base de datos: `expo-sqlite` en su versión web (almacena en OPFS, aún en alfa), siempre detrás
  de `useBase` (`src/db/proveedor.tsx` y `proveedor.web.tsx`).
- **Una sola pestaña activa:** se usa Web Locks. Si se abre una segunda pestaña, pide "Usar aquí"
  para traspasar el control; así dos pestañas nunca escriben la misma base.
- La sesión de Supabase se guarda en `localStorage`.
- Al iniciar pide al navegador almacenamiento persistente, para que no borre los datos solo.
- Service worker propio (plantilla `scripts/sw-plantilla.js`): deja la app disponible sin internet. Cuando hay una versión nueva
  muestra "Hay una versión nueva"; no recarga si hay una venta en curso.

## Desarrollo y prueba local

```bash
npm run web             # desarrollo (sin service worker)
npm run web:construir   # expo export + scripts/construir-web.mjs → dist/_headers y dist/sw.js
npm run web:servir      # sirve dist/ en http://localhost:8080 con las cabeceras de producción
```

Para probar el funcionamiento sin internet: `web:construir`, `web:servir` y en Chrome o Edge abrir
DevTools → Network → Offline. El navegador integrado de algunas herramientas no registra service
workers en localhost, así que no sirve para esta prueba.

## Caja (POS)

| Tecla           | Acción                                                      |
| --------------- | ----------------------------------------------------------- |
| F3              | Buscar producto                                             |
| F4              | Monto libre                                                 |
| F6              | Descuento                                                   |
| F7              | Caja                                                        |
| F8              | Fiado o pago mixto (abre la pantalla de cobro del teléfono) |
| F9              | Cobrar en Efectivo                                          |
| F10             | Cobrar con Débito                                           |
| F11             | Cobrar con Crédito                                          |
| F12             | Cobrar con Transferencia                                    |
| ↑ ↓             | Moverse entre filas                                         |
| + / −           | Subir o bajar la cantidad de la fila                        |
| Supr            | Quitar la fila                                              |
| `3*` + escanear | Agrega 3 unidades del producto escaneado                    |
| Enter           | Confirma el cobro                                           |
| Esc             | Vuelve o cancela                                            |

**Pistola USB:** se reconoce como una ráfaga de teclas (menos de 40 ms entre teclas) terminada en
Enter, y se valida el dígito verificador GS1. Nunca escribe en el monto recibido ni confirma el
cobro. El PIN se puede escribir con el teclado físico.

**Pendiente de verificar:** en Chrome y Edge reales, que F11 (pantalla completa) y F12 (DevTools)
las capture la página. Si el navegador se las queda, hay que cambiar esas dos teclas.

## Equipos y cupos

- El PC ocupa un cupo del plan igual que un teléfono (`dispositivos.tipo` = `'pc'`).
- Al vincular se escribe el nombre del PC (por ejemplo "Caja 1").
- Si el navegador perdió sus datos, en la vinculación se responde **"¿Este PC reemplaza a otro?"**
  y se elige el PC anterior: se reutiliza su id y no se gasta otro cupo.
- El servidor no deja tomar el id de un equipo de otro negocio (error
  `DISPOSITIVO_DE_OTRO_NEGOCIO`): la app se vincula con un id nuevo. Puede pasar con un teléfono
  que antes estuvo en otro negocio.

## Riesgos y recomendaciones de uso

- **No borrar los datos de navegación del sitio** (cookies y datos de sitios): se pierden los
  cambios que no se hayan subido y el id del PC.
- Usar un **perfil de navegador o un usuario de Windows propio para la caja**: la sesión y la base
  quedan en el perfil. El PIN controla quién usa la app, pero no cifra los datos.
- Instalar la web como app (PWA, ícono "Instalar" de la barra de direcciones) ayuda a que el
  navegador conserve los datos.

## Seguridad

`scripts/construir-web.mjs` genera las cabeceras (`dist/_headers`):

- CSP con `'wasm-unsafe-eval'` (SQLite), `worker-src 'self' blob:` y `style-src 'unsafe-inline'`
  (lo exige react-native-web). `connect-src` permite solo el host de Supabase con que se compiló.
- COOP y COEP (necesarias para la base en el navegador), HSTS, `nosniff`, Referrer-Policy y
  Permissions-Policy.
- La web **no lleva** `EXPO_PUBLIC_DATOS_TRANSFERENCIA`: el sitio es público y esos datos no
  deben ir ahí.

## Publicación

El proyecto **`stockeao-web`** de Cloudflare Workers está conectado a este repositorio
(integración de Git): Cloudflare compila y publica solo. Lo que publica lo define
`wrangler.jsonc` (archivos estáticos de `dist/`, cualquier ruta abre `index.html`, sin
redirecciones de `/index.html`).

- **Producción:** cada push a `main` (al fusionar un PR) compila y publica en
  stockeao.grimoriolabs.com. Los PC abiertos ven "Hay una versión nueva → Actualizar".
- **PR:** el workflow **Web** (`.github/workflows/web.yml`) comprueba que compile. Cloudflare
  además puede publicar una vista previa de cada rama (ver abajo).

Configuración en Cloudflare (proyecto `stockeao-web` → Settings → Build):

| Campo                                | Valor                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Production branch                    | `main`                                                                       |
| Build command                        | `npm run web:construir`                                                      |
| Deploy command                       | `npx wrangler deploy`                                                        |
| Non-production branch deploy command | `npx wrangler preview` (por defecto; o desactivar las builds de otras ramas) |
| Root directory                       | `/`                                                                          |

Variables de build (Settings → Build → Variables and secrets):

| Variable                        | Valor                                                                     |
| ------------------------------- | ------------------------------------------------------------------------- |
| `NODE_VERSION`                  | `22`                                                                      |
| `EXPO_PUBLIC_SUPABASE_URL`      | URL del proyecto de Supabase (la misma variable `SUPABASE_URL` de GitHub) |
| `EXPO_PUBLIC_SUPABASE_KEY`      | clave publicable (`SUPABASE_PUBLISHABLE_KEY`)                             |
| `EXPO_PUBLIC_CONTACTO_WHATSAPP` | el mismo valor que la variable `CONTACTO_WHATSAPP` de GitHub              |
| `EXPO_PUBLIC_CONTACTO_CORREO`   | el mismo valor que la variable `CONTACTO_CORREO` de GitHub                |
| `EXIGIR_SUPABASE`               | `true` (el build falla si falta la URL de Supabase)                       |

No agregar `EXPO_PUBLIC_DATOS_TRANSFERENCIA`: el sitio es público.

Pasos manuales antes de la primera publicación:

1. Ejecutar `supabase/migrations/20261018000100_dispositivos_tipo.sql` en el SQL Editor de
   Supabase (`docs/SUPABASE.md`).
2. Configurar el build y las variables de arriba en Cloudflare.
3. Conectar el dominio: proyecto → Settings → Domains & Routes → Add → Custom domain →
   `stockeao.grimoriolabs.com`.
4. Si se usan enlaces de correo de Supabase Auth, agregar el dominio a las URL permitidas.

**La dirección es definitiva:** cambiarla deja los datos locales de los PC en la dirección
anterior (cada dirección tiene su propia base en el navegador).
