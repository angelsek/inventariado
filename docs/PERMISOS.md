# Permisos por persona

## Qué es

El dueño (o quien tenga el permiso «Usuarios y permisos») elige con interruptores qué puede hacer
cada persona del negocio. Se hace en **Más → Usuarios y permisos**: tocar una persona (o **Nueva
persona**) abre su ficha con el nombre (se puede cambiar), el PIN de 4 dígitos, el interruptor
**Activo** y los 15 permisos agrupados en Caja, Clientes, Inventario, Reportes y Configuración.
Todos los equipos del local entran con la misma cuenta de Supabase y cada persona se identifica con
su PIN.

Se eligió dar permisos a cada persona y no por roles porque en un almacén de barrio quien cobra
también hace inventario.

El dueño es fijo: siempre tiene todos los permisos y no se puede desactivar ni eliminar. Junto a su
nombre solo aparece «Dueño». "Cerrar sesión" sigue siendo solo del dueño.

## Los 15 permisos

Una persona nueva parte con 7 permisos (`PERMISOS_INICIALES`); el dueño le suma o le quita los que
quiera.

| Permiso            | Qué permite                                         | Persona nueva |
| ------------------ | --------------------------------------------------- | :-----------: |
| `vender`           | Vender y cobrar                                     |      Sí       |
| `ventas_ver`       | Ver ventas anteriores                               |      Sí       |
| `ventas_anular`    | Anular ventas (devuelve stock y dinero)             |      No       |
| `caja`             | Caja del día: abrir, cerrar, ingresos y retiros     |      Sí       |
| `fiado`            | Clientes y fiado: ver, vender fiado, recibir abonos |      Sí       |
| `clientes_editar`  | Editar datos y límite de fiado de los clientes      |      No       |
| `productos_editar` | Crear y editar productos, precios y categorías      |      Sí       |
| `mercaderia`       | Ingresos de mercadería: compras y proveedores       |      Sí       |
| `stock`            | Conteo de stock y por reponer                       |      Sí       |
| `reportes`         | Reportes del negocio (totales y ganancias)          |      No       |
| `exportar`         | Exportar datos a planillas                          |      No       |
| `negocio`          | Datos del negocio (nombre, RUT, dirección, alcohol) |      No       |
| `usuarios`         | Agregar personas y editar sus datos y permisos      |      No       |
| `suscripcion`      | Pagar el plan y desvincular equipos                 |      No       |
| `cuenta_eliminar`  | Eliminar la cuenta (igual pide la contraseña)       |      No       |

Ver productos y stock, Inicio y "Cambiar de usuario" no necesitan permiso. Las claves nunca se
renombran una vez publicadas: solo se agregan nuevas.

## Reglas de edición

- Nadie toca al dueño salvo el dueño, y solo su nombre y su PIN.
- Nadie cambia sus propios permisos, su nombre ni su estado. Su PIN sí.
- Quien administra usuarios solo puede dar permisos que él mismo tiene.
- Quien administra usuarios no edita a alguien que tiene permisos que él no tiene.
- Solo el dueño cambia a otra persona que también administra usuarios.

## Cómo se aplica

- **Rutas:** cada ruta exige un permiso (`PERMISO_POR_RUTA`). Si alguien escribe la URL a mano,
  también en la web, la app lo bloquea.
- **Menú y botones:** lo que la persona no puede usar no se muestra.
- **PIN:** tras 5 intentos fallidos se espera 30 segundos; si vuelve a fallar, la espera se duplica
  (máximo 15 minutos). El conteo se guarda en la base local.
- **Servidor:** valida que `perfiles.permisos` sea un arreglo de textos de hasta 40 letras, con
  máximo 50 elementos, y el trigger `proteger_permisos` cuida la integridad de los datos.

## Sin internet

Los cambios se aplican de inmediato en el equipo donde se hacen y en los demás al sincronizar.
Después de sincronizar se refrescan los permisos de la persona que está usando la app, sin cerrar
su sesión.

Si dos equipos cambian los permisos de la misma persona, gana el cambio más reciente de permisos
(`perfiles.permisos_en`). Un cambio de PIN o de nombre hecho con datos viejos no devuelve un
permiso que ya se quitó. En los demás campos gana la última escritura.

## APK antiguas y personas existentes

- Las personas que ya existían heredaron los permisos de su rol anterior; los cajeros conservan sus
  4 (vender, ver ventas, caja y fiado).
- Una persona creada desde un APK anterior a los roles recibe los 7 permisos iniciales (es el
  valor por defecto del servidor).

## Límites de seguridad

- Los permisos se aplican en la app. El servidor solo protege la integridad de los datos
  (triggers), porque hay una única cuenta de Supabase por negocio.
- Quien tenga acceso técnico a un equipo podría saltarse los permisos o deducir un PIN de 4
  dígitos desde los datos locales. El PIN es un control de uso, no de seguridad fuerte.
- Las reglas de edición también se aplican en la app: como la cuenta es compartida, quien
  manipule la base local o use un equipo desbloqueado puede saltárselas.

## Paso manual obligatorio

Antes de fusionar el PR (la web se publica sola desde `main` con Cloudflare) y antes de publicar el
APK, ejecutar `supabase/migrations/20261021000100_permisos_por_persona.sql` en el SQL Editor de
Supabase (`docs/SUPABASE.md`). Si falta, la sincronización falla porque no conoce la columna
`perfiles.permisos`. Agrega la columna, migra los datos desde los roles, deja 7 permisos por
defecto, valida el formato y crea el trigger `proteger_permisos`.

## Historia: los roles

Antes (PR 1 y PR 2) los permisos se daban por roles (Administrador, Cajero, Bodeguero) con un
editor de roles. Se retiraron las pantallas de roles y el editor. La tabla `roles`, la columna
`perfiles.rol_id` y sus triggers (migraciones `20261019000100` y `20261020000100`) quedan en
Supabase sin uso: la app ya no los sincroniza. Su limpieza queda para más adelante.

## Archivos clave

- `src/features/permisos/catalogo.ts`: catálogo de los 15 permisos y `PERMISOS_INICIALES`.
- `src/features/permisos/permisos.ts`: `PERMISO_POR_RUTA` y la lógica de comprobación.
- `src/features/permisos/edicionPersonas.ts`: reglas de quién puede editar a quién y qué permisos
  puede dar.
- `src/db/perfiles.ts`: lectura y escritura de personas y permisos.
- `src/app/usuarios.tsx`: lista de personas.
- `src/app/usuario/[id].tsx`: ficha de la persona (nombre, PIN, Activo y permisos).
- `src/sesion/intentosPin.ts`: bloqueo por intentos fallidos del PIN.
- `src/db/migraciones.ts`: migración local 9 (`perfiles.permisos` y `permisos_en`; borra el
  cursor de perfiles para volver a bajarlos).
- `supabase/migrations/20261021000100_permisos_por_persona.sql`: permisos por persona en el
  servidor.
- `supabase/tests/94_pruebas_permisos_por_persona.sql`: pruebas SQL. `scripts/probar-sql.sh` no
  corre en Windows (usa un socket unix); allí se puede replicar levantando Postgres con `pg_ctl` en
  TCP `localhost`.
