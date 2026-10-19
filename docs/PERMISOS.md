# Perfiles y permisos

## Qué es

El dueño le asigna un **rol** a cada persona del negocio en **Más → Usuarios y permisos**. El rol
define qué pantallas y botones ve. Todos los equipos del local entran con la misma cuenta de
Supabase y cada persona se identifica con su PIN de 4 dígitos.

El dueño siempre tiene todos los permisos y no se puede degradar, desactivar ni eliminar.
"Cerrar sesión" sigue siendo solo del dueño.

## Roles y permisos

Cada negocio parte con tres roles predefinidos, que crea el servidor. Hoy no se pueden eliminar
(el editor de roles propios es el PR 2, ver Pendiente). Una persona sin rol queda como Cajero.

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
columna `rol_id`.

## Archivos clave

- `src/features/permisos/catalogo.ts`: catálogo de los 15 permisos y roles predefinidos.
- `src/features/permisos/permisos.ts`: `PERMISO_POR_RUTA` y la lógica de comprobación.
- `src/sesion/intentosPin.ts`: bloqueo por intentos fallidos del PIN.
- `src/db/migraciones.ts`: migración local 8 (tabla `roles`, `perfiles.rol_id`).
- `supabase/migrations/20261019000100_roles_permisos.sql`: roles en el servidor.
- `supabase/tests/90_pruebas_roles_permisos.sql`: pruebas SQL. `scripts/probar-sql.sh` no corre
  en Windows (usa un socket unix); allí se puede replicar levantando Postgres con `pg_ctl` en TCP
  `localhost`.

## Pendiente (PR 2)

Editor de roles: crear roles propios, renombrarlos, activar o desactivar permisos con
interruptores y eliminar los roles propios.
