# Perfiles y permisos

## Qué es

El dueño le asigna un **rol** a cada persona del negocio en **Más → Usuarios y permisos**. El rol
define qué pantallas y botones ve. Todos los equipos del local entran con la misma cuenta de
Supabase y cada persona se identifica con su PIN de 4 dígitos.

El dueño siempre tiene todos los permisos y no se puede degradar, desactivar ni eliminar.
"Cerrar sesión" sigue siendo solo del dueño.

## Roles y permisos

Cada negocio parte con tres roles predefinidos, que crea el servidor. No se pueden eliminar ni
renombrar, pero sí editar sus permisos (ver Editor de roles). Una persona sin rol queda como Cajero.

| Permiso            | Qué permite                                         | Administrador | Cajero | Bodeguero |
| ------------------ | --------------------------------------------------- | :-----------: | :----: | :-------: |
| `vender`           | Vender y cobrar                                     |      Sí       |   Sí   |           |
| `ventas_ver`       | Ver ventas anteriores                               |      Sí       |   Sí   |           |
| `ventas_anular`    | Anular ventas (devuelve stock y dinero)             |      Sí       |        |           |
| `caja`             | Caja del día: abrir, cerrar, ingresos y retiros     |      Sí       |   Sí   |           |
| `fiado`            | Clientes y fiado: ver, vender fiado, recibir abonos |      Sí       |   Sí   |           |
| `clientes_editar`  | Editar datos y límite de fiado de los clientes      |      Sí       |        |           |
| `productos_editar` | Crear y editar productos, precios y categorías      |      Sí       |        |    Sí     |
| `mercaderia`       | Ingresos de mercadería: compras y proveedores       |      Sí       |        |    Sí     |
| `stock`            | Conteo de stock y por reponer                       |      Sí       |        |    Sí     |
| `reportes`         | Reportes del negocio (totales y ganancias)          |      Sí       |        |           |
| `exportar`         | Exportar datos a planillas                          |      Sí       |        |           |
| `negocio`          | Datos del negocio (nombre, RUT, dirección, alcohol) |      Sí       |        |           |
| `usuarios`         | Agregar personas, cambiar su PIN y su rol           |      Sí       |        |           |
| `suscripcion`      | Pagar el plan y desvincular equipos                 |      Sí       |        |           |
| `cuenta_eliminar`  | Eliminar la cuenta (igual pide la contraseña)       |      Sí       |        |           |

Ver productos y stock, Inicio y "Cambiar de usuario" no necesitan permiso. Las claves se guardan
en la tabla `roles` y nunca se renombran una vez publicadas: solo se agregan nuevas.

## Editor de roles

Se abre en **Más → Usuarios y permisos → Editar roles y permisos** (en la web, **Roles** en el
menú lateral). Muestra la lista de roles con las personas de cada uno y el botón **Nuevo rol**.
Cada rol tiene un interruptor por permiso.

- **Predefinidos:** no se renombran ni se eliminan. **Restablecer** los devuelve a sus permisos
  originales. El dueño puede quitarle permisos al Administrador; Restablecer se los devuelve.
- **Roles propios:** se crean, se renombran y se eliminan. **Eliminar** solo está disponible si el
  rol no tiene personas.

### Reglas contra la escalada de permisos

- Solo se pueden dar permisos que quien edita ya tiene.
- Nadie, salvo el dueño, edita su propio rol ni un rol con permisos que no tiene.
- Solo se asignan roles que no dan más permisos que los propios.
- Quien no es dueño no cambia el PIN, el rol ni el estado de alguien con más permisos que él.

### Choques sin internet

Si dos equipos editan roles sin conexión, el servidor resuelve los choques al sincronizar
(`supabase/migrations/20261020000100_editor_roles.sql`), sin avisar en la app:

- **Nombre repetido:** el segundo queda como "Nombre (2)".
- **Eliminar un rol que tiene personas:** se ignora y el rol reaparece.
- **Asignar un rol que otro equipo eliminó:** la persona conserva su rol anterior o queda como
  Cajero.

## Cómo se aplica

- **Rutas:** cada ruta exige un permiso (`PERMISO_POR_RUTA`). Si alguien escribe la URL a mano,
  también en la web, la app lo bloquea.
- **Menú y botones:** lo que la persona no puede usar no se muestra.
- **PIN:** tras 5 intentos fallidos se espera 30 segundos; si vuelve a fallar, la espera se duplica
  (máximo 15 minutos). El conteo se guarda en la base local.

## Límites de seguridad

- Los permisos se aplican en la app. El servidor solo protege la integridad de los datos
  (triggers), porque hay una única cuenta de Supabase por negocio.
- Quien tenga acceso técnico a un equipo podría saltarse los permisos o deducir un PIN de 4
  dígitos desde los datos locales. El PIN es un control de uso, no de seguridad fuerte.
- Las reglas contra la escalada también se aplican en la app: como la cuenta es compartida, quien
  manipule la base local o use un equipo desbloqueado puede saltárselas.
- Entre pares con permisos iguales, uno puede quitarle permisos al rol del otro o desactivarlo; el
  dueño lo corrige.

## Sin internet

Los cambios de rol se aplican de inmediato en el equipo donde se hacen y en los demás al
sincronizar. Después de sincronizar se refrescan los permisos de la persona que está usando la
app, sin cerrar su sesión.

## APK viejas

Una APK anterior a este cambio muestra la vista de Cajero a cualquier persona que no sea el
dueño: un Administrador con una APK vieja ve menos de lo que le corresponde hasta que actualice.
Las personas creadas desde una APK vieja quedan como Cajero.

## Paso manual obligatorio

Antes de publicar el APK o la web con este cambio, ejecutar
`supabase/migrations/20261019000100_roles_permisos.sql` en el SQL Editor de Supabase
(`docs/SUPABASE.md`). Si falta, la sincronización falla porque no conoce la tabla `roles` ni la
columna `rol_id`. Después, ejecutar `supabase/migrations/20261020000100_editor_roles.sql` (editor
de roles). Si se vuelve a ejecutar la de `20261019000100`, hay que reejecutar también la de
`20261020000100`.

## Archivos clave

- `src/features/permisos/catalogo.ts`: catálogo de los 15 permisos y roles predefinidos.
- `src/features/permisos/permisos.ts`: `PERMISO_POR_RUTA` y la lógica de comprobación.
- `src/sesion/intentosPin.ts`: bloqueo por intentos fallidos del PIN.
- `src/db/migraciones.ts`: migración local 8 (tabla `roles`, `perfiles.rol_id`).
- `supabase/migrations/20261019000100_roles_permisos.sql`: roles en el servidor.
- `supabase/migrations/20261020000100_editor_roles.sql`: choques del editor de roles.
- `supabase/tests/90_pruebas_roles_permisos.sql`: pruebas SQL. `scripts/probar-sql.sh` no corre
  en Windows (usa un socket unix); allí se puede replicar levantando Postgres con `pg_ctl` en TCP
  `localhost`.
- `supabase/tests/92_pruebas_editor_roles.sql`: pruebas SQL del editor de roles.
