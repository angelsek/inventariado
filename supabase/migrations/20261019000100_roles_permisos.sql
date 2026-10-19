-- Roles y permisos: el dueño define qué puede hacer cada persona del local.
--
-- Modelo:
--   * Cada negocio tiene roles (Administrador, Cajero, Bodeguero y, más adelante, los que
--     cree el dueño). `permisos` es un arreglo de claves; el catálogo vive en la app
--     (src/features/permisos/catalogo.ts) y las claves desconocidas se ignoran allá.
--   * perfiles.rol_id dice el rol de cada persona. El dueño (perfiles.rol = 'dueno') no
--     tiene rol: siempre tiene todos los permisos. perfiles.rol se mantiene ('dueno' o
--     'cajero') para las APK viejas, que muestran la vista de cajero a todo no-dueño.
--   * Como todo el local usa la misma cuenta de Supabase, los permisos se aplican en la
--     app. Aquí se protege la integridad: el dueño no se degrada, desactiva ni elimina, no
--     aparece un segundo dueño y nadie usa un rol de otro negocio.
--
-- Se puede ejecutar más de una vez sin error: completa lo que falte y no borra datos.

create or replace function inventariado.permisos_validos(p_permisos jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_permisos) = 'array'
     and jsonb_array_length(p_permisos) <= 50
     and not exists (
       select 1 from jsonb_array_elements(p_permisos) e where jsonb_typeof(e) <> 'string'
     );
$$;

create table if not exists inventariado.roles (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references inventariado.negocios (id),
  nombre text not null check (length(trim(nombre)) between 1 and 40),
  permisos jsonb not null default '[]'::jsonb
    check (inventariado.permisos_validos(permisos)),
  predefinido text check (predefinido in ('administrador', 'cajero', 'bodeguero')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists roles_negocio_idx on inventariado.roles (negocio_id);
create unique index if not exists roles_predefinido_unico
  on inventariado.roles (negocio_id, predefinido) where predefinido is not null;
create unique index if not exists roles_nombre_unico
  on inventariado.roles (negocio_id, lower(trim(nombre))) where not eliminado;

drop trigger if exists roles_sync on inventariado.roles;
create trigger roles_sync before insert or update on inventariado.roles
  for each row execute function inventariado.marcar_cambio_sync();

alter table inventariado.roles enable row level security;

drop policy if exists roles_select on inventariado.roles;
create policy roles_select on inventariado.roles
  for select to authenticated using (inventariado.es_miembro(negocio_id));
drop policy if exists roles_insert on inventariado.roles;
create policy roles_insert on inventariado.roles
  for insert to authenticated with check (inventariado.es_miembro(negocio_id));
drop policy if exists roles_update on inventariado.roles;
create policy roles_update on inventariado.roles
  for update to authenticated using (inventariado.es_miembro(negocio_id))
  with check (inventariado.es_miembro(negocio_id));

grant select, insert, update on inventariado.roles to authenticated;
grant all on inventariado.roles to service_role;

alter table inventariado.perfiles
  add column if not exists rol_id uuid references inventariado.roles (id);
create index if not exists perfiles_rol_idx on inventariado.perfiles (rol_id);

-- ---------------------------------------------------------------------------
-- Roles predefinidos (las listas repiten ROLES_PREDEFINIDOS de la app)
-- ---------------------------------------------------------------------------

create or replace function inventariado.crear_roles_predefinidos(p_negocio_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into inventariado.roles (negocio_id, nombre, permisos, predefinido)
  values
    (p_negocio_id, 'Administrador',
     '["vender", "ventas_ver", "ventas_anular", "caja", "fiado", "clientes_editar",
       "productos_editar", "mercaderia", "stock", "reportes", "exportar", "negocio",
       "usuarios", "suscripcion", "cuenta_eliminar"]'::jsonb,
     'administrador'),
    (p_negocio_id, 'Cajero', '["vender", "ventas_ver", "caja", "fiado"]'::jsonb, 'cajero'),
    (p_negocio_id, 'Bodeguero', '["productos_editar", "mercaderia", "stock"]'::jsonb,
     'bodeguero')
  on conflict do nothing;
$$;

revoke execute on function inventariado.crear_roles_predefinidos(uuid)
  from public, anon, authenticated;

-- Cada negocio nuevo nace con sus roles (crear_negocio no necesita cambiar).
create or replace function inventariado.negocio_con_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform inventariado.crear_roles_predefinidos(new.id);
  return new;
end;
$$;

drop trigger if exists negocios_roles on inventariado.negocios;
create trigger negocios_roles after insert on inventariado.negocios
  for each row execute function inventariado.negocio_con_roles();

-- ---------------------------------------------------------------------------
-- Integridad
-- ---------------------------------------------------------------------------

-- security definer: revisa roles y perfiles del negocio sin pasar por la RLS.
create or replace function inventariado.proteger_perfiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.negocio_id <> old.negocio_id then
      raise exception 'Un perfil no se puede mover a otro negocio' using errcode = '42501';
    end if;
    if old.rol = 'dueno' and (new.rol <> 'dueno' or not new.activo or new.eliminado) then
      raise exception 'El perfil del dueño no se puede cambiar de rol, desactivar ni eliminar'
        using errcode = '42501';
    end if;
    if old.rol <> 'dueno' and new.rol = 'dueno' then
      raise exception 'Solo puede haber un dueño' using errcode = '42501';
    end if;
  elsif new.rol = 'dueno' and exists (
    -- El upsert del propio dueño (mismo id) pasa por aquí antes de convertirse en update.
    select 1 from inventariado.perfiles
     where negocio_id = new.negocio_id and rol = 'dueno' and id <> new.id
  ) then
    raise exception 'Solo puede haber un dueño' using errcode = '42501';
  end if;

  if new.rol = 'dueno' then
    new.rol_id := null;
  elsif new.rol_id is not null then
    if not exists (
      select 1 from inventariado.roles
       where id = new.rol_id and negocio_id = new.negocio_id
         -- Un rol eliminado no se asigna; quien ya lo tenía puede seguir guardándose.
         and (not eliminado or (tg_op = 'UPDATE' and new.rol_id = old.rol_id))
    ) then
      raise exception 'El rol no es de este negocio' using errcode = '23503';
    end if;
  else
    -- Llega sin rol (APK sin roles o equipo que aún no los descarga). En un upsert de una
    -- persona que ya existe, este BEFORE INSERT corre antes del update y su valor pasa a
    -- EXCLUDED: se conserva el rol que ya tiene para no degradarla. Si no tiene, Cajero.
    select rol_id into new.rol_id from inventariado.perfiles where id = new.id;
    if new.rol_id is null then
      select id into new.rol_id from inventariado.roles
       where negocio_id = new.negocio_id and predefinido = 'cajero';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_proteger on inventariado.perfiles;
create trigger perfiles_proteger before insert or update on inventariado.perfiles
  for each row execute function inventariado.proteger_perfiles();

-- security invoker (a propósito): current_user es quien inserta. Dentro de
-- crear_roles_predefinidos() (security definer) es el dueño de esa función.
create or replace function inventariado.proteger_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Los predefinidos los crea solo crear_roles_predefinidos().
    -- Un upsert de un rol que ya existe también pasa por aquí: solo se revisa si es nuevo.
    if new.predefinido is not null and current_user in ('authenticated', 'anon')
       and not exists (select 1 from inventariado.roles where id = new.id) then
      raise exception 'Los roles predefinidos los crea el sistema' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.negocio_id <> old.negocio_id then
    raise exception 'Un rol no se puede mover a otro negocio' using errcode = '42501';
  end if;
  if new.predefinido is distinct from old.predefinido then
    raise exception 'No se puede cambiar si un rol es predefinido' using errcode = '42501';
  end if;
  if new.eliminado and not old.eliminado and old.predefinido is not null then
    raise exception 'Los roles predefinidos no se pueden eliminar' using errcode = '42501';
  end if;
  if new.eliminado and not old.eliminado and exists (
    select 1 from inventariado.perfiles where rol_id = new.id and not eliminado
  ) then
    raise exception 'ROL_CON_PERSONAS' using errcode = 'P0001',
      detail = 'Cambia de rol a las personas antes de eliminarlo.';
  end if;
  return new;
end;
$$;

drop trigger if exists roles_proteger on inventariado.roles;
create trigger roles_proteger before insert or update on inventariado.roles
  for each row execute function inventariado.proteger_roles();

-- ---------------------------------------------------------------------------
-- Datos existentes: roles para cada negocio y los cajeros actuales pasan a Cajero
-- ---------------------------------------------------------------------------

select inventariado.crear_roles_predefinidos(id) from inventariado.negocios;

update inventariado.perfiles p
   set rol_id = r.id
  from inventariado.roles r
 where r.negocio_id = p.negocio_id
   and r.predefinido = 'cajero'
   and p.rol = 'cajero'
   and p.rol_id is null;

-- ---------------------------------------------------------------------------
-- Eliminar la cuenta también borra los roles (copia de la versión de
-- 20261001000100_suscripcion_google_play.sql, con roles después de perfiles).
-- ---------------------------------------------------------------------------

create or replace function inventariado.eliminar_mi_negocio(p_negocio_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from inventariado.negocio_usuarios
     where negocio_id = p_negocio_id and usuario_id = auth.uid() and rol = 'dueno'
  ) then
    raise exception 'Solo el dueño puede eliminar el negocio' using errcode = '42501';
  end if;

  -- En orden, de las tablas que dependen de otras hacia arriba.
  delete from inventariado.compras_play where negocio_id = p_negocio_id;
  delete from inventariado.movimientos_cliente where negocio_id = p_negocio_id;
  delete from inventariado.pagos where negocio_id = p_negocio_id;
  delete from inventariado.venta_items where negocio_id = p_negocio_id;
  delete from inventariado.ventas where negocio_id = p_negocio_id;
  delete from inventariado.clientes where negocio_id = p_negocio_id;
  delete from inventariado.movimientos_caja where negocio_id = p_negocio_id;
  delete from inventariado.cajas where negocio_id = p_negocio_id;
  delete from inventariado.compra_items where negocio_id = p_negocio_id;
  delete from inventariado.compras where negocio_id = p_negocio_id;
  delete from inventariado.proveedores where negocio_id = p_negocio_id;
  delete from inventariado.movimientos_stock where negocio_id = p_negocio_id;
  delete from inventariado.productos where negocio_id = p_negocio_id;
  delete from inventariado.categorias where negocio_id = p_negocio_id;
  delete from inventariado.perfiles where negocio_id = p_negocio_id;
  delete from inventariado.roles where negocio_id = p_negocio_id;
  delete from inventariado.dispositivos where negocio_id = p_negocio_id;
  delete from inventariado.comentarios where negocio_id = p_negocio_id;
  update inventariado.errores_app set negocio_id = null where negocio_id = p_negocio_id;
  delete from inventariado.pagos_suscripcion where negocio_id = p_negocio_id;
  delete from inventariado.suscripciones where negocio_id = p_negocio_id;
  delete from inventariado.negocio_usuarios where negocio_id = p_negocio_id;
  delete from inventariado.negocios where id = p_negocio_id;
end;
$$;

revoke execute on function inventariado.eliminar_mi_negocio(uuid) from public, anon;
grant execute on function inventariado.eliminar_mi_negocio(uuid) to authenticated;

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
