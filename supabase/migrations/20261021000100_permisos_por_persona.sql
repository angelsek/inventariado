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

-- Cada persona hereda los permisos de su rol; sin rol, o con uno eliminado, los del Cajero
-- de su negocio. El dueño no usa la lista: tiene todos los permisos.
update inventariado.perfiles p
   set permisos = case
     when p.rol = 'dueno' then '[]'::jsonb
     else coalesce(
       (select r.permisos from inventariado.roles r
         where r.id = p.rol_id and r.negocio_id = p.negocio_id and not r.eliminado),
       (select r.permisos from inventariado.roles r
         where r.negocio_id = p.negocio_id and r.predefinido = 'cajero'),
       '["vender", "ventas_ver", "caja", "fiado"]'::jsonb)
   end
 where p.permisos is null;

-- Persona creada por una APK sin esta columna: parte con lo típico de un almacén
-- (PERMISOS_INICIALES en la app). Un upsert sin la columna no la toca.
alter table inventariado.perfiles
  alter column permisos set default
    '["vender", "ventas_ver", "caja", "fiado", "productos_editar", "mercaderia", "stock"]'::jsonb;
alter table inventariado.perfiles alter column permisos set not null;

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
end;
$$;

-- El dueño siempre tiene todo: su lista se guarda vacía para que no se lea como un límite.
create or replace function inventariado.permisos_del_dueno()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rol = 'dueno' then
    new.permisos := '[]'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_permisos on inventariado.perfiles;
create trigger perfiles_permisos before insert or update on inventariado.perfiles
  for each row execute function inventariado.permisos_del_dueno();

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
