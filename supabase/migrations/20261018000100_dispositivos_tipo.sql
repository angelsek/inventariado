-- Versión web (PC): un equipo vinculado puede ser un teléfono o un PC. Los dos ocupan
-- cupo del plan por igual (Básico 2, Pro 5). Se puede ejecutar más de una vez.

alter table inventariado.dispositivos
  add column if not exists tipo text not null default 'telefono';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'dispositivos_tipo_check'
       and conrelid = 'inventariado.dispositivos'::regclass
  ) then
    alter table inventariado.dispositivos
      add constraint dispositivos_tipo_check check (tipo in ('telefono', 'pc'));
  end if;
end;
$$;

-- Nueva firma con p_tipo (por defecto 'telefono'): las apps Android ya instaladas llaman con
-- tres argumentos nombrados y siguen funcionando. Se borra la firma vieja para que no haya
-- dos funciones con el mismo nombre (la llamada sería ambigua).
drop function if exists inventariado.registrar_dispositivo(uuid, uuid, text);

create or replace function inventariado.registrar_dispositivo(
  p_id uuid,
  p_negocio_id uuid,
  p_nombre text,
  p_tipo text default 'telefono'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activos integer;
  v_limite integer := inventariado.max_dispositivos(p_negocio_id);
begin
  if not inventariado.es_miembro(p_negocio_id) then
    raise exception 'Sin acceso a este negocio' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('telefono', 'pc') then
    raise exception 'Tipo de equipo no válido' using errcode = '22023';
  end if;
  if p_nombre is null or length(trim(p_nombre)) = 0 or length(p_nombre) > 60 then
    raise exception 'Nombre de equipo no válido' using errcode = '22023';
  end if;
  -- Un id que ya es de otro negocio no se puede tomar: si no, quien conozca el id de un equipo
  -- ajeno lo movería a su negocio (la función salta RLS). La app usa entonces un id nuevo.
  if exists (select 1 from inventariado.dispositivos
              where id = p_id and negocio_id <> p_negocio_id) then
    raise exception 'DISPOSITIVO_DE_OTRO_NEGOCIO' using errcode = '42501';
  end if;

  -- Volver a registrar un equipo ya vinculado (o reemplazar un PC usando su mismo id)
  -- no ocupa otro cupo.
  select count(*) into v_activos from inventariado.dispositivos
   where negocio_id = p_negocio_id and not eliminado and id <> p_id;

  if v_activos >= v_limite then
    raise exception 'LIMITE_DISPOSITIVOS'
      using errcode = 'P0001', detail = format('%s de %s equipos', v_activos, v_limite);
  end if;

  -- Permite reactivar un equipo desvinculado (ver proteger_dispositivos()).
  perform set_config('inventariado.reactivar_dispositivo', p_id::text, true);
  insert into inventariado.dispositivos (id, negocio_id, nombre, tipo, eliminado)
  values (p_id, p_negocio_id, p_nombre, p_tipo, false)
  on conflict (id) do update
    set nombre = excluded.nombre, tipo = excluded.tipo, eliminado = false
    where inventariado.dispositivos.negocio_id = excluded.negocio_id;
end;
$$;

-- Lista de equipos para la pantalla Suscripción (y para elegir qué PC se reemplaza).
create or replace function inventariado.mis_dispositivos(p_negocio_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when inventariado.es_miembro(p_negocio_id) then jsonb_build_object(
    'limite', inventariado.max_dispositivos(p_negocio_id),
    'dispositivos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'nombre', nombre, 'tipo', tipo, 'ultimo_sync', ultimo_sync)
             order by creado_en)
        from inventariado.dispositivos
       where negocio_id = p_negocio_id and not eliminado), '[]'::jsonb)
  ) end;
$$;

revoke execute on function inventariado.registrar_dispositivo(uuid, uuid, text, text)
  from public, anon;
grant execute on function inventariado.registrar_dispositivo(uuid, uuid, text, text)
  to authenticated;
revoke execute on function inventariado.mis_dispositivos(uuid) from public, anon;
grant execute on function inventariado.mis_dispositivos(uuid) to authenticated;

notify pgrst, 'reload schema';
