-- Fase 6: piloto. Versiones publicadas del APK, registro de errores y comentarios.
--
-- Se puede ejecutar más de una vez sin error.

-- ---------------------------------------------------------------------------
-- Versiones del APK (la app avisa cuando hay una más nueva)
-- ---------------------------------------------------------------------------

create table if not exists inventariado.versiones_app (
  version_code integer primary key,
  version text not null,
  url text not null,
  notas text,
  obligatoria boolean not null default false,
  publicada_en timestamptz not null default now()
);

alter table inventariado.versiones_app enable row level security;
revoke all on inventariado.versiones_app from anon, authenticated;
grant all on inventariado.versiones_app to service_role;

-- Última versión publicada. La consulta la app al abrir, incluso sin sesión.
create or replace function inventariado.ultima_version()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(v) from inventariado.versiones_app v order by version_code desc limit 1;
$$;

-- Carpeta pública de Supabase Storage donde el workflow sube los APK.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('apk', 'apk', true)
    on conflict (id) do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Errores de la app (los ve el administrador)
-- ---------------------------------------------------------------------------

create table if not exists inventariado.errores_app (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid,
  usuario_id uuid,
  version text,
  dispositivo text,
  mensaje text not null,
  detalle text,
  creado_en timestamptz not null default now()
);

create index if not exists errores_app_fecha_idx on inventariado.errores_app (creado_en desc);

alter table inventariado.errores_app enable row level security;
revoke all on inventariado.errores_app from anon, authenticated;
grant all on inventariado.errores_app to service_role;

-- Guarda un error. Recorta los textos para que un error enorme no llene la base.
create or replace function inventariado.registrar_error(
  p_mensaje text,
  p_detalle text default null,
  p_version text default null,
  p_dispositivo text default null,
  p_negocio_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo se asocia el negocio si quien informa pertenece a él.
  insert into inventariado.errores_app (negocio_id, usuario_id, version, dispositivo, mensaje, detalle)
  values (
    case when p_negocio_id is not null and inventariado.es_miembro(p_negocio_id) then p_negocio_id end,
    auth.uid(),
    left(p_version, 50),
    left(p_dispositivo, 100),
    left(coalesce(p_mensaje, 'Error sin mensaje'), 500),
    left(p_detalle, 4000)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Comentarios de los clientes
-- ---------------------------------------------------------------------------

create table if not exists inventariado.comentarios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references inventariado.negocios (id),
  usuario_id uuid,
  perfil text,
  version text,
  texto text not null check (length(trim(texto)) > 0),
  leido boolean not null default false,
  creado_en timestamptz not null default now()
);

create index if not exists comentarios_fecha_idx on inventariado.comentarios (creado_en desc);

alter table inventariado.comentarios enable row level security;
revoke all on inventariado.comentarios from anon, authenticated;
grant all on inventariado.comentarios to service_role;

create or replace function inventariado.enviar_comentario(
  p_negocio_id uuid,
  p_texto text,
  p_perfil text default null,
  p_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not inventariado.es_miembro(p_negocio_id) then
    raise exception 'Sin acceso a este negocio' using errcode = '42501';
  end if;
  insert into inventariado.comentarios (negocio_id, usuario_id, perfil, version, texto)
  values (p_negocio_id, auth.uid(), left(p_perfil, 100), left(p_version, 50), left(trim(p_texto), 2000));
end;
$$;

-- ---------------------------------------------------------------------------
-- Administración
-- ---------------------------------------------------------------------------

create or replace function inventariado.admin_listar_reportes(p_limite integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform inventariado.exigir_admin();
  return jsonb_build_object(
    'comentarios', coalesce((
      select jsonb_agg(to_jsonb(c) || jsonb_build_object('negocio', n.nombre) order by c.creado_en desc)
        from (select * from inventariado.comentarios order by creado_en desc limit p_limite) c
        join inventariado.negocios n on n.id = c.negocio_id), '[]'::jsonb),
    'errores', coalesce((
      select jsonb_agg(to_jsonb(e) || jsonb_build_object('negocio', n.nombre) order by e.creado_en desc)
        from (select * from inventariado.errores_app order by creado_en desc limit p_limite) e
        left join inventariado.negocios n on n.id = e.negocio_id), '[]'::jsonb)
  );
end;
$$;

create or replace function inventariado.admin_marcar_comentario(p_id uuid, p_leido boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform inventariado.exigir_admin();
  update inventariado.comentarios set leido = p_leido where id = p_id;
end;
$$;

do $$
declare
  f text;
begin
  revoke execute on function inventariado.ultima_version() from public;
  grant execute on function inventariado.ultima_version() to anon, authenticated;
  revoke execute on function inventariado.registrar_error(text, text, text, text, uuid) from public;
  grant execute on function inventariado.registrar_error(text, text, text, text, uuid) to anon, authenticated;
  foreach f in array array[
    'inventariado.enviar_comentario(uuid, text, text, text)',
    'inventariado.admin_listar_reportes(integer)',
    'inventariado.admin_marcar_comentario(uuid, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
