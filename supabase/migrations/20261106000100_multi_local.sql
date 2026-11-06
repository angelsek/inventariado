-- Varios locales por cuenta. Una misma cuenta de dueño puede tener varios negocios (locales) y
-- cambiar de uno a otro dentro de la app sin cerrar sesión. Cada local sigue siendo un negocio
-- completo, con su suscripción, sus equipos, sus perfiles y sus permisos.
--
-- Además, una persona que no es el dueño (administrador, trabajador) puede trabajar en más de
-- un local si el dueño le da el permiso «multi_local» y la asigna a cada local. Cada local tiene
-- su propio perfil de esa persona (con su PIN y sus permisos); `perfiles.persona_id` los une.
--
-- Qué hace el servidor y qué no (igual que el resto de los permisos, ver docs/PERMISOS.md):
--   * Todos los equipos de la cuenta usan la misma sesión de Supabase, así que el servidor no
--     distingue entre el dueño y un trabajador. Quién puede asignar locales y quién puede
--     cambiar de local lo decide la app. Aquí se cuida la integridad y que cada llamada solo
--     toque negocios de los que la cuenta es miembro.
--
-- Se puede ejecutar más de una vez sin error. No borra datos.

-- ---------------------------------------------------------------------------
-- Persona común a varios locales
-- ---------------------------------------------------------------------------

alter table inventariado.perfiles add column if not exists persona_id uuid;
create index if not exists perfiles_persona_idx on inventariado.perfiles (persona_id)
  where persona_id is not null;

-- Una vez puesto, persona_id no cambia: solo asegura que los perfiles de una persona sigan
-- unidos aunque un equipo con una versión vieja suba la fila sin la columna.
create or replace function inventariado.proteger_persona()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.persona_id is not null then
    new.persona_id := old.persona_id;
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_persona on inventariado.perfiles;
create trigger perfiles_persona before update on inventariado.perfiles
  for each row execute function inventariado.proteger_persona();

-- ---------------------------------------------------------------------------
-- crear_negocio(): una cuenta puede tener varios locales
-- ---------------------------------------------------------------------------

-- Misma firma que la de 20261023000100 (los APK ya instalados siguen funcionando). Cambios:
--   * ya no rechaza a quien tiene un negocio;
--   * la prueba gratis de los locales 2 en adelante: 7 días solo si algún local de la cuenta ya
--     tiene el plan pagado y al día. Si no, el local nace sin prueba (hay que contratarlo).
--     La primera prueba sigue siendo una por negocio (consumir_prueba).
create or replace function inventariado.crear_negocio(
  p_nombre text,
  p_rut text,
  p_direccion text,
  p_perfil_id uuid,
  p_nombre_dueno text,
  p_pin_hash text,
  p_equipo_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_negocio uuid;
  v_tenia_locales boolean;
  v_pagado boolean;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;

  v_tenia_locales := exists (
    select 1 from inventariado.negocio_usuarios nu
      join inventariado.negocios n on n.id = nu.negocio_id and not n.eliminado
     where nu.usuario_id = v_usuario);
  v_pagado := exists (
    select 1 from inventariado.negocio_usuarios nu
      join inventariado.negocios n on n.id = nu.negocio_id and not n.eliminado
      join inventariado.suscripciones s on s.negocio_id = n.id
     where nu.usuario_id = v_usuario and s.pagado_hasta >= now());

  -- Lo lee el trigger de la suscripción, que corre dentro del insert de abajo.
  perform set_config('inventariado.equipo_prueba', coalesce(p_equipo_id::text, ''), true);

  insert into inventariado.negocios (nombre, rut, direccion)
  values (trim(p_nombre), nullif(trim(p_rut), ''), nullif(trim(p_direccion), ''))
  returning id into v_negocio;

  if v_tenia_locales then
    update inventariado.suscripciones
       set prueba_hasta = case when v_pagado then now() + interval '7 days' else null end
     where negocio_id = v_negocio;
  end if;

  insert into inventariado.negocio_usuarios (negocio_id, usuario_id, rol)
  values (v_negocio, v_usuario, 'dueno');

  insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
  values (p_perfil_id, v_negocio, trim(p_nombre_dueno), 'dueno', p_pin_hash);

  return v_negocio;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lista de locales
-- ---------------------------------------------------------------------------

-- Locales de la cuenta, para el selector. Siempre filtra por la sesión: la app no manda
-- ningún id de usuario.
create or replace function inventariado.mis_negocios()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id,
           'nombre', n.nombre,
           'direccion', n.direccion,
           'estado', inventariado.estado_suscripcion(s),
           'plan', s.plan_id) order by n.creado_en), '[]'::jsonb)
    from inventariado.negocio_usuarios nu
    join inventariado.negocios n on n.id = nu.negocio_id and not n.eliminado
    left join inventariado.suscripciones s on s.negocio_id = n.id
   where nu.usuario_id = auth.uid();
$$;

-- Locales donde una persona tiene perfil activo con el permiso multi_local. Solo cuentan los
-- negocios de los que la cuenta es miembro.
create or replace function inventariado.mis_locales_como_persona(p_persona_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id,
           'nombre', n.nombre,
           'direccion', n.direccion,
           'estado', inventariado.estado_suscripcion(s),
           'plan', s.plan_id,
           'perfil_id', p.id) order by n.creado_en), '[]'::jsonb)
    from inventariado.perfiles p
    join inventariado.negocios n on n.id = p.negocio_id and not n.eliminado
    left join inventariado.suscripciones s on s.negocio_id = n.id
   where p.persona_id = p_persona_id
     and p.activo and not p.eliminado
     and p.permisos ? 'multi_local'
     and inventariado.es_miembro(n.id);
$$;

-- Crea en otro local el perfil de una persona, unido por persona_id al que ya tiene. El
-- permiso multi_local se agrega siempre (si no, la persona quedaría sin poder volver).
create or replace function inventariado.asignar_persona_a_local(
  p_perfil_id uuid,
  p_negocio_destino uuid,
  p_nombre text,
  p_pin_hash text,
  p_persona_id uuid,
  p_permisos jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permisos jsonb := coalesce(p_permisos, '[]'::jsonb);
begin
  if not inventariado.es_miembro(p_negocio_destino) then
    raise exception 'Sin acceso a este negocio' using errcode = '42501';
  end if;
  if p_persona_id is null or p_nombre is null or length(trim(p_nombre)) = 0
     or length(p_nombre) > 40 or p_pin_hash is null or length(p_pin_hash) = 0 then
    raise exception 'Datos de la persona no válidos' using errcode = '22023';
  end if;
  if not (inventariado.permisos_validos(v_permisos) and inventariado.claves_cortas(v_permisos)) then
    raise exception 'Permisos no válidos' using errcode = '22023';
  end if;
  -- El id del perfil no puede ser de otro negocio (la función salta RLS).
  if exists (select 1 from inventariado.perfiles where id = p_perfil_id) then
    raise exception 'PERFIL_YA_EXISTE' using errcode = '23505';
  end if;
  -- La persona no se asigna dos veces al mismo local.
  if exists (select 1 from inventariado.perfiles
              where negocio_id = p_negocio_destino and persona_id = p_persona_id
                and not eliminado) then
    raise exception 'PERSONA_YA_ASIGNADA' using errcode = '23505';
  end if;

  if not (v_permisos ? 'multi_local') then
    v_permisos := v_permisos || '["multi_local"]'::jsonb;
  end if;

  insert into inventariado.perfiles
    (id, negocio_id, nombre, rol, pin_hash, permisos, persona_id)
  values
    (p_perfil_id, p_negocio_destino, trim(p_nombre), 'cajero', p_pin_hash, v_permisos,
     p_persona_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'inventariado.crear_negocio(text, text, text, uuid, text, text, uuid)',
    'inventariado.mis_negocios()',
    'inventariado.mis_locales_como_persona(uuid)',
    'inventariado.asignar_persona_a_local(uuid, uuid, text, text, uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Interna: solo la usa el trigger.
  execute 'revoke execute on function inventariado.proteger_persona() from public, anon, authenticated';
end;
$$;

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
