-- Permisos por persona: el dueño elige con interruptores qué puede hacer cada persona (en
-- un almacén de barrio quien cobra también hace inventario). perfiles.permisos es un
-- arreglo de claves del catálogo de la app (src/features/permisos/catalogo.ts).
--
-- Los roles salen de la app. La tabla roles, perfiles.rol_id y sus triggers se quedan en
-- el servidor sin uso (nunca llegó a clientes una versión con roles): se pueden retirar
-- en una limpieza futura.
--
-- Requiere 20261019000100_roles_permisos.sql. Se puede ejecutar más de una vez sin error:
-- solo completa las personas que aún no tienen permisos.

alter table inventariado.perfiles add column if not exists permisos jsonb;
-- Versión de los permisos: cuándo los cambió el servidor por última vez (reloj del
-- servidor). Cada equipo devuelve la versión que descargó; si es más vieja que la del
-- servidor (por ejemplo, un cambio de PIN hecho sin internet con la lista vieja), sus
-- permisos no se aplican: ver proteger_permisos().
alter table inventariado.perfiles add column if not exists permisos_en timestamptz;

-- Cada persona hereda los permisos de su rol; sin rol, o con uno eliminado, los del Cajero
-- de su negocio. El dueño no usa la lista: tiene todos los permisos.
update inventariado.perfiles p
   set permisos = case
     when p.rol = 'dueno' then '[]'::jsonb
     else coalesce(
       (select r.permisos from inventariado.roles r
         where r.id = p.rol_id and r.negocio_id = p.negocio_id and not r.eliminado limit 1),
       (select r.permisos from inventariado.roles r
         where r.negocio_id = p.negocio_id and r.predefinido = 'cajero' limit 1),
       '["vender", "ventas_ver", "caja", "fiado"]'::jsonb)
   end
 where p.permisos is null;

-- Persona creada por una APK sin esta columna: parte con lo típico de un almacén
-- (PERMISOS_INICIALES en la app). Un upsert sin la columna no la toca.
alter table inventariado.perfiles
  alter column permisos set default
    '["vender", "ventas_ver", "caja", "fiado", "productos_editar", "mercaderia", "stock"]'::jsonb;
alter table inventariado.perfiles alter column permisos set not null;

update inventariado.perfiles set permisos_en = creado_en where permisos_en is null;
alter table inventariado.perfiles alter column permisos_en set default now();
alter table inventariado.perfiles alter column permisos_en set not null;

-- Además del formato (permisos_validos), cada clave es un texto corto: las claves del
-- catálogo tienen menos de 20 letras.
create or replace function inventariado.claves_cortas(p_permisos jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_permisos) <> 'array' or not exists (
    select 1 from jsonb_array_elements_text(p_permisos) e where length(e) > 40
  );
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'perfiles_permisos_validos'
       and conrelid = 'inventariado.perfiles'::regclass
  ) then
    alter table inventariado.perfiles
      add constraint perfiles_permisos_validos check (inventariado.permisos_validos(permisos));
  end if;
  if not exists (
    select 1 from pg_constraint
     where conname = 'perfiles_permisos_cortos'
       and conrelid = 'inventariado.perfiles'::regclass
  ) then
    alter table inventariado.perfiles
      add constraint perfiles_permisos_cortos check (inventariado.claves_cortas(permisos));
  end if;
end;
$$;

-- El dueño siempre tiene todo: su lista se guarda vacía para que no se lea como un límite.
-- Para los demás, permisos_en es la versión de la lista y la pone el servidor (now()), así
-- que no depende del reloj de cada equipo:
--   * Persona nueva: versión = ahora.
--   * Subida con una versión más vieja que la del servidor: la lista del equipo estaba
--     desactualizada y se conservan los permisos del servidor (el resto de la fila sí se
--     guarda, por ejemplo un PIN nuevo).
--   * Subida al día que cambia la lista: se guarda y la versión pasa a ser ahora.
-- Un upsert de una persona que ya existe pasa primero por el BEFORE INSERT: ahí no se toca
-- la versión, para que el UPDATE compare la que mandó el equipo. Las APK sin estas
-- columnas no las mandan y no las tocan.
create or replace function inventariado.proteger_permisos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol = 'dueno' then
    new.permisos := '[]'::jsonb;
    new.permisos_en := coalesce(new.permisos_en, now());
  elsif tg_op = 'INSERT' then
    if not exists (select 1 from inventariado.perfiles where id = new.id) then
      new.permisos_en := now();
    end if;
  elsif new.permisos_en is null or new.permisos_en < old.permisos_en then
    new.permisos := old.permisos;
    new.permisos_en := old.permisos_en;
  elsif new.permisos is distinct from old.permisos then
    new.permisos_en := now();
  else
    new.permisos_en := old.permisos_en;
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_permisos on inventariado.perfiles;
drop function if exists inventariado.permisos_del_dueno();
create trigger perfiles_permisos before insert or update on inventariado.perfiles
  for each row execute function inventariado.proteger_permisos();

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
