# Varios locales por cuenta

Una misma cuenta de dueño puede tener varios locales (negocios) y cambiar de uno a otro dentro de
la app, sin cerrar sesión. Pensado para clientes con más de un local.

## Modelo

- Cada local es un **negocio completo**: su suscripción, sus equipos (cupos del plan), sus perfiles,
  sus permisos y su PIN de dueño. No hay organización ni plan multi-local: **cada local se cobra
  por separado** (el trato o descuento por más locales se da a mano en Administración).
- `negocio_usuarios` ya admitía varios negocios por usuario; `crear_negocio()` dejó de rechazar a
  quien ya tiene uno. **No hay tope de locales por cuenta.**
- **Prueba gratis:** el primer local sigue con su prueba única (`docs/PRUEBA_GRATIS.md`). Un local
  nuevo recibe 7 días solo si algún local de la cuenta tiene el plan pagado **y** ningún otro local
  está sin pagar (así no se encadenan pruebas); si no, nace sin prueba y hay que contratarlo.
- **Personas en más de un local:** el permiso `multi_local` («Trabajar en más de un local») lo da
  solo el dueño. Cada local tiene su propio perfil de la persona (permisos y PIN propios); los
  perfiles se unen por `perfiles.persona_id`, que arma el servidor en `asignar_persona_a_local()`.

## Cómo se cambia de local

Más → «Cambiar de local» (pantalla `locales`). Requiere internet.

1. Se comprueba el permiso y que el servidor liste ese local para la persona (`mis_negocios()` para
   el dueño; `mis_locales_como_persona()` para las demás). La app nunca decide a qué locales se entra.
2. Se pausa la sincronización automática y se sincroniza. Si quedan cambios sin subir, **no se
   cambia** (se perderían ventas): se avisa y no se borra nada.
3. El equipo se registra en el local nuevo **antes** de borrar nada (si está al tope de equipos, el
   error llega sin tocar los datos). Se vuelve a comprobar que no entraron cambios.
4. Se borran los datos locales, se baja el local nuevo y se pide el PIN (con la persona ya elegida).
5. El equipo se **desvincula del local que deja** para no gastar un cupo por local. Cada local
   recuerda el id de equipo de este teléfono (`dispositivo:<negocio>`), así que al volver se
   reactiva el mismo.
6. Si falla después de borrar, se libera el cupo del destino y se intenta volver al local de origen;
   si tampoco se puede, el equipo queda sin sesión con un aviso.

Quien llegó desde otro local siempre ve «Volver a …», aunque en el nuevo ya no tenga `multi_local`.

## Agregar un local y asignar personas

- **Agregar local** (solo dueño): Mis locales → «Agregar local». Pide los cambios al día antes de
  crear nada. Si el local se crea pero no se puede pasar a él, se avisa que ya existe y se lleva a
  Mis locales (no se vuelve a crear).
- **Asignar a otro local** (solo dueño): ficha de la persona → «Trabaja en otros locales». El dueño
  escribe el PIN que usará en cada local (el hash lleva el id del perfil, por eso es distinto en cada
  local aunque el número sea el mismo). El perfil nuevo parte con los permisos de aquí más `multi_local`.

## Límites

- **Seguridad «nivel 1»:** los trabajadores no tienen cuenta propia; usan la sesión del dueño. El
  servidor no distingue entre dueño y trabajador, así que quién cambia de local o asigna personas se
  controla en la app (igual que el resto de los permisos, `docs/PERMISOS.md`). Un técnico con el
  token de un equipo podría leer o escribir en otros locales de la misma cuenta. Aislarlo de verdad
  requiere cuentas propias para trabajadores y rediseñar la RLS (fase aparte).
- Un APK anterior a esta versión con una cuenta de varios locales abre uno cualquiera y no ve el
  selector.
- Al iniciar sesión se abre el último local usado en el equipo (si no hay, el más antiguo).
- Cambiar de local necesita internet; la primera descarga puede tardar en un local grande.
- «Eliminar cuenta» borra solo el local actual y cierra la sesión; los demás locales siguen vivos.
- Si el cliente hoy tiene un correo por local, hace falta una forma de unirlos (no incluida).
- Play Billing (en pausa): cada compra se vincula a un negocio; con varios locales hay que decidir
  a cuál se asigna antes de activarlo.

## Paso manual obligatorio

Antes de publicar el APK o la web, ejecutar `supabase/migrations/20261106000100_multi_local.sql` en
el SQL Editor de Supabase (`docs/SUPABASE.md`). Si falta, la sincronización de perfiles falla
(columna `persona_id` desconocida) en todos los negocios. Agrega `perfiles.persona_id`, el índice
único por local, el trigger que la protege y las funciones `mis_negocios`,
`mis_locales_como_persona` y `asignar_persona_a_local`, y reemplaza `crear_negocio` (misma firma).

## Archivos clave

- `src/sesion/cuenta.ts`: `listarLocales`, `cambiarDeLocal`, `agregarLocal`, `asignarPersonaALocal`.
- `src/sync/pausa.ts`: pausa de la sincronización durante el cambio.
- `src/app/locales.tsx`, `src/app/nuevo-local.tsx`, `src/features/cuenta/AsignarALocales.tsx`.
- `supabase/migrations/20261106000100_multi_local.sql` y `supabase/tests/99_pruebas_multi_local.sql`.
