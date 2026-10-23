# Prueba gratis: una por negocio

La prueba gratis dura **7 días** y es **una sola por negocio real**. La regla vive en el
servidor (Supabase), no en la app: la aplica el trigger que crea la suscripción de cada negocio
nuevo (migración `supabase/migrations/20261023000100_una_prueba_por_negocio.sql`).

Antes, cada fila nueva de `inventariado.negocios` recibía 7 días sin ningún tope, así que
cualquiera creaba otra cuenta con otro correo y empezaba otra prueba. El candado de exportar a
Excel solo con plan pagado (rama `feat/importar-exportar-solo-pagado`, todavía sin fusionar) deja
el ciclo «exporto el catálogo → creo otra cuenta → importo → prueba nueva» a medias, porque
importar sigue libre a propósito. Esto es lo que lo cierra.

## Las tres llaves

Al crear el negocio se calculan hasta tres llaves. **Todas pesan igual: si cualquiera ya usó su
prueba, no hay prueba nueva.**

| Llave      | De dónde sale                                                                                 | Qué cierra                                              |
| ---------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Equipo** | El id derivado del ANDROID_ID (`src/sesion/idTelefono.ts`), que sobrevive a reinstalar la app | El caso real: un teléfono reciclando cuentas            |
| **Correo** | `auth.users.email`, en minúsculas, sin la etiqueta `+algo` y, en Gmail, sin los puntos        | Borrar la cuenta y volver a crearla con el mismo correo |
| **RUT**    | `negocios.rut`, dejando solo dígitos y K (es opcional: si no se escribe, no se usa)           | Al cliente que escribe su RUT real las dos veces        |

El RUT tiene una regla aparte: **solo se anota cuando el alta es una prueba nueva de verdad**
(ninguna llave conocida). Es el único dato que el cliente escribe libre y que identifica a un
tercero, así que si cada alta lo anotara, una sola cuenta podría borrarse y recrearse en bucle
dejando sin prueba a todos los RUT que quisiera, antes de que esos negocios se registren. Con la
regla, quemar un RUT ajeno cuesta una cuenta nueva por cada uno, y el negocio afectado se
arregla con «Liberar prueba y dar 7 días».

De cada llave se guarda **solo una huella SHA-256** con prefijo de dominio
(`stockeao-prueba:<tipo>:<valor>`), nunca el dato. Viven en `inventariado.pruebas_usadas`, que
**no tiene `negocio_id`** a propósito: así sobrevive a `eliminar_mi_negocio()` sin dejar rastro
de a quién pertenecía, y `sincronizar_descarga()` la rechaza por no tener `sync_xid`.

La app manda el id del equipo en el séptimo parámetro de `crear_negocio` (`p_equipo_id`, con
`default null`), así que **los APK ya instalados siguen funcionando**: su negocio se limita solo
por correo y RUT. Si el servidor todavía no tiene la migración, la app reintenta sin ese
parámetro (`src/sesion/cuenta.ts`).

## Qué recibe un negocio nuevo

- Ninguna llave conocida → **7 días** desde ahora, plan Pro, como siempre.
- Alguna llave conocida y su prueba **todavía corre** → la **misma fecha de término**, no 7 días
  nuevos. Así, quien se equivocó al crear la cuenta y la rehace el mismo día no pierde nada y
  tampoco gana una prueba extra.
- Alguna llave conocida y su prueba **ya venció** → `prueba_hasta` nulo: **sin prueba**.

Sin prueba, `estado_suscripcion()` y `calcularEstado()` devuelven `suspendida` y la app queda en
solo lectura. Como nunca hubo una suscripción que suspender, los textos son otros
(`sinPrueba` en `src/features/suscripcion/estado.ts`):

- aviso al terminar de crear la cuenta, con el botón «Ver planes»;
- franja permanente arriba de la app, que lleva a Suscripción;
- la pantalla de Suscripción muestra «Sin prueba gratis», la explicación y el botón para
  escribir por WhatsApp;
- si intenta vender, el diálogo explica lo mismo en vez de hablar de una suspensión.

La cuenta **sí se crea**: quien quiere pagar tiene que poder entrar y pagar, y el administrador
necesita un negocio sobre el que actuar.

## La salida para los casos legítimos

Un dueño que cambia de teléfono no pasa por esta regla (no crea otro negocio). Los que sí:
teléfono de segunda mano que ya tuvo Stockeao, un segundo local de verdad desde el mismo
teléfono, o un cliente al que se le quiere dar otra oportunidad.

En **Más → Administración**, el negocio aparece marcado «Sin prueba (ya la usó este cliente)» y
hay dos acciones distintas:

- **Liberar prueba y dar 7 días** (`admin_liberar_prueba`): olvida lo anotado para las llaves de
  ese negocio y le da 7 días. Las llaves quedan anotadas con la fecha nueva, así que sigue
  siendo una sola prueba. **Esta es la salida para un negocio bloqueado.** No levanta una
  suspensión puesta a mano: para eso está «Quitar suspensión», que es una decisión aparte.
- **Extender prueba 7 días** (la de siempre): alarga la prueba de un interesado, pero **no**
  toca el registro, así que no sirve para desbloquear.

Límite conocido: `admin_liberar_prueba` recalcula las llaves desde el servidor (correo, RUT y
equipos vinculados). Si el equipo quedó vinculado con un id al azar (camino
`DISPOSITIVO_DE_OTRO_NEGOCIO` de `cuenta.ts`), esa llave no se puede recalcular; igual se liberan
correo y RUT y la prueba se extiende, que es lo que importa.

## Qué sigue siendo evadible

Esto es una **barrera de producto, no una frontera de seguridad** (igual que exportar solo con
plan pagado). El cierre duro sigue siendo el pago.

- Un **teléfono nuevo** o un restablecimiento de fábrica cambian el ANDROID_ID.
- En la **versión web (PC)** el id del equipo es al azar, así que ahí solo rigen correo y RUT.
- El id del equipo **lo envía el cliente**: un APK modificado puede mandar cualquier UUID.
- Un correo nuevo es gratis, y el RUT es opcional.
- El servidor **no valida el dígito verificador** del RUT (lo valida la app): un cliente
  modificado puede cambiar ese último dígito y conseguir una llave distinta. Se podría usar solo
  el cuerpo del RUT como llave; no se hizo porque quien modifica el cliente también puede cambiar
  el equipo y el correo.
- Los **negocios sin `prueba_hasta`** que ya existían (por ejemplo los de Google Play, donde la
  prueba la da Google) no quedaron anotados: pueden borrarse y recibir una prueba una vez más.
- Los **APK anteriores a esta versión** no mandan el id del equipo, así que esos negocios se
  limitan solo por correo y RUT hasta que el cliente actualice. No se anotan los equipos al
  borrar la cuenta a propósito: un negocio con tres teléfonos dejaría sin prueba a los tres, y
  el segundo teléfono suele ser de un empleado que no tiene nada que ver.

Riesgo de soporte, no de evasión: el RUT es un dato casi público, así que un negocio legítimo
puede nacer sin prueba porque alguien lo escribió antes (el contador, un familiar, un segundo
local con el mismo RUT, o alguien de mala fe). Por eso el panel lo muestra marcado y la salida
del administrador es parte del diseño, no un parche.

Lo que **no** es un hueco: dos cuentas creadas en el mismo instante con la misma llave. Antes
las dos habrían recibido 7 días, porque cada una leía antes de que la otra escribiera;
`consumir_prueba` toma un cerrojo de transacción por llave (ordenado, para no trabarse) y las
pone en fila.

Lo que sí cierra es el caso común: el mismo almacenero, en el mismo teléfono, con el mismo correo
o el mismo RUT.

## Privacidad

La huella sobrevive a eliminar la cuenta, así que está declarada en los textos legales
(`src/legal/textos.ts`, regenerados en `docs/legal-web/`): Términos §3 (la prueba es una por
negocio), Privacidad §1 (qué se guarda), Privacidad §5 y la página de eliminar cuenta (qué queda
después de eliminar).

Es un dato **seudonimizado, no anónimo**, y el texto público lo dice así. No hay sal secreta y
el prefijo está en este repositorio, así que quien lea la tabla puede probar RUT uno por uno
(son unos 25 millones) o correos de una lista y averiguar cuáles ya usaron la prueba. La huella
del equipo sí resiste, porque sale de un SHA-256. Si algún día hace falta subir el listón, lo
que corresponde es un HMAC con un secreto fuera de la tabla (Supabase Vault), asumiendo que
rotarlo invalida todo lo anotado.

## Paso manual

La migración se ejecuta a mano en el **SQL Editor de Supabase** (`docs/SUPABASE.md`), **antes**
de fusionar el PR y de publicar el APK o la web. Al ejecutarla, anota también los negocios que ya
existen con la fecha de su prueba actual, para que no puedan empezar otra.
