-- Fase 1: negocios, usuarios, perfiles (cajeros) y dispositivos.
--
-- Modelo de acceso:
--   * Cada negocio tiene una o más cuentas de Supabase Auth (por ahora, la del dueño).
--     Los teléfonos del local inician sesión con esa cuenta.
--   * Los cajeros NO tienen cuenta propia: son "perfiles" del negocio que se
--     identifican con un PIN en el teléfono.
--   * Todas las tablas del negocio llevan negocio_id y se protegen con RLS.
--
-- Sincronización:
--   * Cada fila guarda en sync_xid el id de la transacción que la escribió.
--   * La app descarga los cambios con la función sincronizar_descarga(), que
--     usa el xmin del snapshot como cursor (no se pierden filas escritas por
--     transacciones concurrentes).
--   * Nunca se borran filas: se marcan con eliminado = true.
--
-- Todo vive en el esquema "inventariado" para poder compartir el proyecto de
-- Supabase con otras aplicaciones sin mezclar tablas. El esquema debe estar
-- en Settings → Data API → Exposed schemas.

create schema if not exists inventariado;
grant usage on schema inventariado to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Utilidades de sincronización
-- ---------------------------------------------------------------------------

create or replace function inventariado.marcar_cambio_sync()
returns trigger
language plpgsql
as $$
begin
  new.sync_xid := pg_current_xact_id();
  new.actualizado_en := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table inventariado.negocios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  rut text,
  direccion text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

-- Cuentas de Supabase Auth con acceso a un negocio.
create table inventariado.negocio_usuarios (
  negocio_id uuid not null references inventariado.negocios (id),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol text not null default 'dueno' check (rol in ('dueno')),
  creado_en timestamptz not null default now(),
  primary key (negocio_id, usuario_id)
);

create index negocio_usuarios_usuario_idx on inventariado.negocio_usuarios (usuario_id);

-- Personas que usan la app en el local (dueño y cajeros), identificadas por PIN.
create table inventariado.perfiles (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references inventariado.negocios (id),
  nombre text not null check (length(trim(nombre)) > 0),
  rol text not null check (rol in ('dueno', 'cajero')),
  pin_hash text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index perfiles_negocio_idx on inventariado.perfiles (negocio_id);

-- Teléfonos registrados en el negocio.
create table inventariado.dispositivos (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  nombre text not null,
  ultimo_sync timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index dispositivos_negocio_idx on inventariado.dispositivos (negocio_id);

create trigger negocios_sync before insert or update on inventariado.negocios
  for each row execute function inventariado.marcar_cambio_sync();
create trigger perfiles_sync before insert or update on inventariado.perfiles
  for each row execute function inventariado.marcar_cambio_sync();
create trigger dispositivos_sync before insert or update on inventariado.dispositivos
  for each row execute function inventariado.marcar_cambio_sync();

-- ---------------------------------------------------------------------------
-- Seguridad (RLS)
-- ---------------------------------------------------------------------------

-- security definer: consulta negocio_usuarios sin pasar por su propia RLS.
create or replace function inventariado.es_miembro(p_negocio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from inventariado.negocio_usuarios
    where negocio_id = p_negocio_id and usuario_id = auth.uid()
  );
$$;

alter table inventariado.negocios enable row level security;
alter table inventariado.negocio_usuarios enable row level security;
alter table inventariado.perfiles enable row level security;
alter table inventariado.dispositivos enable row level security;

-- Los negocios se crean con crear_negocio(). La política de insert solo existe
-- porque un upsert (insert ... on conflict do update) la exige; como pide ser
-- miembro, no permite crear negocios nuevos.
create policy negocios_insert on inventariado.negocios
  for insert to authenticated with check (inventariado.es_miembro(id));
create policy negocios_select on inventariado.negocios
  for select to authenticated using (inventariado.es_miembro(id));
create policy negocios_update on inventariado.negocios
  for update to authenticated using (inventariado.es_miembro(id)) with check (inventariado.es_miembro(id));

create policy negocio_usuarios_select on inventariado.negocio_usuarios
  for select to authenticated using (usuario_id = auth.uid());

create policy perfiles_select on inventariado.perfiles
  for select to authenticated using (inventariado.es_miembro(negocio_id));
create policy perfiles_insert on inventariado.perfiles
  for insert to authenticated with check (inventariado.es_miembro(negocio_id));
create policy perfiles_update on inventariado.perfiles
  for update to authenticated using (inventariado.es_miembro(negocio_id))
  with check (inventariado.es_miembro(negocio_id));

create policy dispositivos_select on inventariado.dispositivos
  for select to authenticated using (inventariado.es_miembro(negocio_id));
create policy dispositivos_insert on inventariado.dispositivos
  for insert to authenticated with check (inventariado.es_miembro(negocio_id));
create policy dispositivos_update on inventariado.dispositivos
  for update to authenticated using (inventariado.es_miembro(negocio_id))
  with check (inventariado.es_miembro(negocio_id));

-- sync_xid y actualizado_en los sobrescribe siempre el trigger, así que la app
-- puede hacer upsert de filas completas. negocio_usuarios solo se lee.
-- Un esquema nuevo no hereda los permisos por defecto de "public": se dan aquí.
-- (service_role es para tareas administrativas futuras; ignora la RLS.)
grant select, insert, update on inventariado.negocios, inventariado.perfiles,
  inventariado.dispositivos to authenticated;
grant select on inventariado.negocio_usuarios to authenticated;
grant all on all tables in schema inventariado to service_role;

-- ---------------------------------------------------------------------------
-- Funciones llamadas desde la app
-- ---------------------------------------------------------------------------

-- Crea el negocio, vincula la cuenta actual como dueña y crea el perfil del dueño.
-- El id del perfil y el hash del PIN los genera la app.
create or replace function inventariado.crear_negocio(
  p_nombre text,
  p_rut text,
  p_direccion text,
  p_perfil_id uuid,
  p_nombre_dueno text,
  p_pin_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_negocio uuid;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;

  if exists (select 1 from inventariado.negocio_usuarios where usuario_id = v_usuario) then
    raise exception 'Esta cuenta ya tiene un negocio' using errcode = '23505';
  end if;

  insert into inventariado.negocios (nombre, rut, direccion)
  values (trim(p_nombre), nullif(trim(p_rut), ''), nullif(trim(p_direccion), ''))
  returning id into v_negocio;

  insert into inventariado.negocio_usuarios (negocio_id, usuario_id, rol)
  values (v_negocio, v_usuario, 'dueno');

  insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
  values (p_perfil_id, v_negocio, trim(p_nombre_dueno), 'dueno', p_pin_hash);

  return v_negocio;
end;
$$;

-- Devuelve las filas de p_tabla escritas desde el cursor p_desde, más el
-- nuevo cursor. La RLS de la tabla se aplica (security invoker).
-- Filas repetidas entre llamadas son posibles y la app las aplica de nuevo sin problema.
create or replace function inventariado.sincronizar_descarga(
  p_tabla text,
  p_negocio_id uuid,
  p_desde text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_cursor xid8 := pg_snapshot_xmin(pg_current_snapshot());
  v_filas jsonb;
begin
  if p_tabla not in ('negocios', 'perfiles', 'dispositivos') then
    raise exception 'Tabla no sincronizable: %', p_tabla using errcode = '22023';
  end if;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) - ''sync_xid'' order by t.sync_xid), ''[]''::jsonb)
       from inventariado.%I t
      where %s = $1 and ($2::xid8 is null or t.sync_xid >= $2::xid8)',
    p_tabla,
    case when p_tabla = 'negocios' then 't.id' else 't.negocio_id' end
  )
  into v_filas
  using p_negocio_id, p_desde;

  return jsonb_build_object('cursor', v_cursor::text, 'filas', v_filas);
end;
$$;

revoke execute on function inventariado.crear_negocio(text, text, text, uuid, text, text) from public, anon;
grant execute on function inventariado.crear_negocio(text, text, text, uuid, text, text) to authenticated;
revoke execute on function inventariado.sincronizar_descarga(text, uuid, text) from public, anon;
grant execute on function inventariado.sincronizar_descarga(text, uuid, text) to authenticated;
revoke execute on function inventariado.es_miembro(uuid) from public, anon;
grant execute on function inventariado.es_miembro(uuid) to authenticated;
