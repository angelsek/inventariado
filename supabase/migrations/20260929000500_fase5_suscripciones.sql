-- Fase 5: planes, suscripciones, límite de teléfonos y administración.
--
-- Sin pasarela de pago: el administrador (dueño de la app) registra los pagos
-- a mano desde el panel de administración de la app.
--
-- Estado de una suscripción (ver inventariado.estado_suscripcion):
--   suspendida  si se marcó a mano, o si pasaron los días de gracia sin pagar
--   activa      pagado_hasta >= ahora
--   prueba      prueba_hasta >= ahora
--   vencida     venció hace menos de DIAS_GRACIA días (la app avisa y sigue funcionando)
-- Suspendida = la app queda en solo lectura. Nunca se borran datos.
--
-- Se puede ejecutar más de una vez sin error.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists inventariado.planes (
  id text primary key,
  nombre text not null,
  precio_mensual integer not null check (precio_mensual >= 0),
  max_dispositivos integer not null check (max_dispositivos > 0),
  reportes_avanzados boolean not null default false,
  orden integer not null default 0
);

-- "do nothing": si ya se cambiaron los precios, volver a ejecutar no los pisa.
insert into inventariado.planes (id, nombre, precio_mensual, max_dispositivos, reportes_avanzados, orden)
values
  ('basico', 'Básico', 9990, 2, false, 1),
  ('pro', 'Pro', 19990, 5, true, 2)
on conflict (id) do nothing;

-- Una fila por negocio. id = negocio_id (la app sincroniza por id).
create table if not exists inventariado.suscripciones (
  id uuid primary key,
  negocio_id uuid not null unique references inventariado.negocios (id),
  plan_id text not null references inventariado.planes (id),
  prueba_hasta timestamptz,
  pagado_hasta timestamptz,
  suspendida boolean not null default false,
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

-- Historial de pagos registrados por el administrador.
create table if not exists inventariado.pagos_suscripcion (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references inventariado.negocios (id),
  plan_id text not null references inventariado.planes (id),
  meses integer not null check (meses > 0),
  monto integer not null check (monto >= 0),
  medio text,
  notas text,
  pagado_hasta timestamptz not null,
  registrado_por uuid references auth.users (id),
  creado_en timestamptz not null default now()
);

create index if not exists pagos_suscripcion_negocio_idx on inventariado.pagos_suscripcion (negocio_id);

-- Cuentas con acceso al panel de administración (se agregan a mano, ver docs/SUPABASE.md).
create table if not exists inventariado.administradores (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);

drop trigger if exists suscripciones_sync on inventariado.suscripciones;
create trigger suscripciones_sync before insert or update on inventariado.suscripciones
  for each row execute function inventariado.marcar_cambio_sync();

-- ---------------------------------------------------------------------------
-- Suscripción automática con prueba gratis al crear un negocio
-- ---------------------------------------------------------------------------

create or replace function inventariado.crear_suscripcion_de_prueba()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Durante la prueba se usa el plan Pro, para que se pueda probar todo.
  insert into inventariado.suscripciones (id, negocio_id, plan_id, prueba_hasta)
  values (new.id, new.id, 'pro', now() + interval '14 days')
  on conflict (negocio_id) do nothing;
  return new;
end;
$$;

drop trigger if exists negocios_suscripcion on inventariado.negocios;
create trigger negocios_suscripcion after insert on inventariado.negocios
  for each row execute function inventariado.crear_suscripcion_de_prueba();

-- Negocios creados antes de esta fase: reciben 14 días de prueba desde hoy.
insert into inventariado.suscripciones (id, negocio_id, plan_id, prueba_hasta)
select n.id, n.id, 'pro', now() + interval '14 days'
  from inventariado.negocios n
 where not exists (select 1 from inventariado.suscripciones s where s.negocio_id = n.id);

-- ---------------------------------------------------------------------------
-- Estado y límites
-- ---------------------------------------------------------------------------

create or replace function inventariado.estado_suscripcion(s inventariado.suscripciones)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when s.suspendida then 'suspendida'
    when s.pagado_hasta >= now() then 'activa'
    when s.prueba_hasta >= now() then 'prueba'
    when greatest(s.pagado_hasta, s.prueba_hasta) + interval '7 days' >= now() then 'vencida'
    else 'suspendida'
  end;
$$;

create or replace function inventariado.max_dispositivos(p_negocio_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.max_dispositivos from inventariado.suscripciones s
       join inventariado.planes p on p.id = s.plan_id
      where s.negocio_id = p_negocio_id),
    1);
$$;

-- Registra (o vuelve a vincular) un teléfono respetando el límite del plan.
-- Error LIMITE_DISPOSITIVOS si el plan no permite más teléfonos activos.
create or replace function inventariado.registrar_dispositivo(
  p_id uuid,
  p_negocio_id uuid,
  p_nombre text
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

  select count(*) into v_activos from inventariado.dispositivos
   where negocio_id = p_negocio_id and not eliminado and id <> p_id;

  if v_activos >= v_limite then
    raise exception 'LIMITE_DISPOSITIVOS'
      using errcode = 'P0001', detail = format('%s de %s teléfonos', v_activos, v_limite);
  end if;

  -- Permite reactivar un teléfono desvinculado (ver trigger de abajo).
  perform set_config('inventariado.reactivar_dispositivo', p_id::text, true);
  insert into inventariado.dispositivos (id, negocio_id, nombre, eliminado)
  values (p_id, p_negocio_id, p_nombre, false)
  on conflict (id) do update
    set negocio_id = excluded.negocio_id, nombre = excluded.nombre, eliminado = false;
end;
$$;

-- Protege el límite también cuando la app sincroniza: un teléfono nuevo que no
-- pasó por registrar_dispositivo() no entra si no hay cupo, y uno desvinculado
-- no se reactiva solo al sincronizar.
create or replace function inventariado.proteger_dispositivos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- En un upsert el trigger de insert corre aunque la fila ya exista.
    if exists (select 1 from inventariado.dispositivos where id = new.id) then
      return new;
    end if;
    if not new.eliminado and (
      select count(*) from inventariado.dispositivos
       where negocio_id = new.negocio_id and not eliminado
    ) >= inventariado.max_dispositivos(new.negocio_id) then
      raise exception 'LIMITE_DISPOSITIVOS' using errcode = 'P0001';
    end if;
  elsif old.eliminado and not new.eliminado
        and coalesce(current_setting('inventariado.reactivar_dispositivo', true), '') <> new.id::text then
    new.eliminado := true;
  end if;
  return new;
end;
$$;

drop trigger if exists dispositivos_limite on inventariado.dispositivos;
create trigger dispositivos_limite before insert or update on inventariado.dispositivos
  for each row execute function inventariado.proteger_dispositivos();

-- ---------------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------------

alter table inventariado.planes enable row level security;
alter table inventariado.suscripciones enable row level security;
alter table inventariado.pagos_suscripcion enable row level security;
alter table inventariado.administradores enable row level security;

drop policy if exists planes_select on inventariado.planes;
create policy planes_select on inventariado.planes for select to authenticated using (true);

-- Los miembros solo leen su suscripción y sus pagos; se modifican con las funciones de admin.
drop policy if exists suscripciones_select on inventariado.suscripciones;
create policy suscripciones_select on inventariado.suscripciones
  for select to authenticated using (inventariado.es_miembro(negocio_id));
drop policy if exists pagos_suscripcion_select on inventariado.pagos_suscripcion;
create policy pagos_suscripcion_select on inventariado.pagos_suscripcion
  for select to authenticated using (inventariado.es_miembro(negocio_id));

revoke all on inventariado.planes, inventariado.suscripciones, inventariado.pagos_suscripcion,
  inventariado.administradores from anon, authenticated;
grant select on inventariado.planes, inventariado.suscripciones, inventariado.pagos_suscripcion
  to authenticated;
grant all on all tables in schema inventariado to service_role;

-- ---------------------------------------------------------------------------
-- Funciones para la app (dueño del negocio)
-- ---------------------------------------------------------------------------

-- Teléfonos del negocio y límite del plan, para la pantalla de suscripción.
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
      select jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'ultimo_sync', ultimo_sync)
                       order by creado_en)
        from inventariado.dispositivos
       where negocio_id = p_negocio_id and not eliminado), '[]'::jsonb)
  ) end;
$$;

-- Desvincula un teléfono para liberar cupo. Ese teléfono cierra sesión al sincronizar.
create or replace function inventariado.desvincular_dispositivo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update inventariado.dispositivos set eliminado = true
   where id = p_id and inventariado.es_miembro(negocio_id);
  if not found then
    raise exception 'Teléfono no encontrado' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Funciones de administración (solo cuentas en inventariado.administradores)
-- ---------------------------------------------------------------------------

create or replace function inventariado.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from inventariado.administradores where usuario_id = auth.uid());
$$;

create or replace function inventariado.exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not inventariado.es_admin() then
    raise exception 'Solo para administradores' using errcode = '42501';
  end if;
end;
$$;

create or replace function inventariado.admin_listar_negocios()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform inventariado.exigir_admin();
  return coalesce((
    select jsonb_agg(fila order by fila->>'nombre')
      from (
        select jsonb_build_object(
          'id', n.id,
          'nombre', n.nombre,
          'rut', n.rut,
          'creado_en', n.creado_en,
          'correo', (select u.email from inventariado.negocio_usuarios nu
                       join auth.users u on u.id = nu.usuario_id
                      where nu.negocio_id = n.id limit 1),
          'plan_id', s.plan_id,
          'estado', inventariado.estado_suscripcion(s),
          'prueba_hasta', s.prueba_hasta,
          'pagado_hasta', s.pagado_hasta,
          'suspendida', s.suspendida,
          'notas', s.notas,
          'dispositivos', (select count(*) from inventariado.dispositivos d
                            where d.negocio_id = n.id and not d.eliminado),
          'ultimo_sync', (select max(d.ultimo_sync) from inventariado.dispositivos d
                           where d.negocio_id = n.id)
        ) as fila
          from inventariado.negocios n
          join inventariado.suscripciones s on s.negocio_id = n.id
         where not n.eliminado
      ) t), '[]'::jsonb);
end;
$$;

-- Registra un pago: extiende pagado_hasta en `p_meses` desde la fecha más tardía
-- entre hoy, el pago anterior y el fin de la prueba (no se pierden días pagados).
create or replace function inventariado.admin_registrar_pago(
  p_negocio_id uuid,
  p_plan_id text,
  p_meses integer,
  p_monto integer,
  p_medio text default null,
  p_notas text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hasta timestamptz;
begin
  perform inventariado.exigir_admin();

  select greatest(now(), coalesce(pagado_hasta, now()), coalesce(prueba_hasta, now()))
         + make_interval(months => p_meses)
    into v_hasta
    from inventariado.suscripciones where negocio_id = p_negocio_id;
  if v_hasta is null then
    raise exception 'Negocio sin suscripción' using errcode = 'P0002';
  end if;

  update inventariado.suscripciones
     set plan_id = p_plan_id, pagado_hasta = v_hasta, suspendida = false
   where negocio_id = p_negocio_id;

  insert into inventariado.pagos_suscripcion
    (negocio_id, plan_id, meses, monto, medio, notas, pagado_hasta, registrado_por)
  values (p_negocio_id, p_plan_id, p_meses, p_monto, p_medio, p_notas, v_hasta, auth.uid());

  return v_hasta;
end;
$$;

create or replace function inventariado.admin_actualizar_suscripcion(
  p_negocio_id uuid,
  p_plan_id text default null,
  p_dias_prueba integer default null,
  p_suspendida boolean default null,
  p_notas text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform inventariado.exigir_admin();
  update inventariado.suscripciones
     set plan_id = coalesce(p_plan_id, plan_id),
         prueba_hasta = case when p_dias_prueba is null then prueba_hasta
                             else greatest(now(), coalesce(prueba_hasta, now()))
                                  + make_interval(days => p_dias_prueba) end,
         suspendida = coalesce(p_suspendida, suspendida),
         notas = coalesce(p_notas, notas)
   where negocio_id = p_negocio_id;
  if not found then
    raise exception 'Negocio sin suscripción' using errcode = 'P0002';
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'inventariado.registrar_dispositivo(uuid, uuid, text)',
    'inventariado.mis_dispositivos(uuid)',
    'inventariado.desvincular_dispositivo(uuid)',
    'inventariado.es_admin()',
    'inventariado.admin_listar_negocios()',
    'inventariado.admin_registrar_pago(uuid, text, integer, integer, text, text)',
    'inventariado.admin_actualizar_suscripcion(uuid, text, integer, boolean, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'inventariado.crear_suscripcion_de_prueba()',
    'inventariado.proteger_dispositivos()',
    'inventariado.exigir_admin()',
    'inventariado.max_dispositivos(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
