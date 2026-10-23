-- Pruebas de la migración prueba_7_dias (los negocios nuevos reciben 7 días gratis, no 14).
\set ON_ERROR_STOP on
\o /dev/null

create function pg_temp.como(p_usuario uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_usuario::text, ''), false);
  if p_usuario is null then
    set role anon;
  else
    set role authenticated;
  end if;
end;
$$;

-- Negocio nuevo de Fran.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000070', 'fran@ejemplo.cl');
select pg_temp.como('00000000-0000-0000-0000-000000000070');
select inventariado.crear_negocio('Bazar Fran', null, null, gen_random_uuid(), 'Fran', 'x') as negocio_fran \gset
reset role;
select set_config('pruebas.negocio_fran', :'negocio_fran', false);

-- Recibe el plan Pro en prueba por 7 días.
do $$
declare
  s inventariado.suscripciones;
begin
  select * into s from inventariado.suscripciones where negocio_id = current_setting('pruebas.negocio_fran')::uuid;
  if s is null or s.plan_id <> 'pro' or inventariado.estado_suscripcion(s) <> 'prueba' then
    raise exception 'FALLA: el negocio nuevo no quedó en prueba con plan Pro: %', s;
  end if;
  if s.prueba_hasta < now() + interval '6 days 23 hours'
     or s.prueba_hasta > now() + interval '7 days 1 minute' then
    raise exception 'FALLA: la prueba no dura 7 días: %', s.prueba_hasta;
  end if;
end;
$$;

-- La función del trigger sigue sin poder llamarse directamente.
do $$
begin
  if has_function_privilege('authenticated', 'inventariado.crear_suscripcion_de_prueba()', 'execute')
     or has_function_privilege('anon', 'inventariado.crear_suscripcion_de_prueba()', 'execute') then
    raise exception 'FALLA: crear_suscripcion_de_prueba quedó ejecutable para los usuarios';
  end if;
end;
$$;

\o
select 'Todas las pruebas SQL de la prueba de 7 días pasaron';
