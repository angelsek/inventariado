-- Pruebas de la migración de fase 5 (usa datos de las pruebas anteriores).
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

select id as negocio_ana from inventariado.negocios where nombre like 'Botillería Ana%' \gset
select id as negocio_beto from inventariado.negocios where nombre = 'Almacén Beto' \gset
select set_config('pruebas.negocio_ana', :'negocio_ana', false);
select set_config('pruebas.negocio_beto', :'negocio_beto', false);

-- Carla es la administradora de la app (no es dueña de ningún negocio).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'carla@inventariado.cl');
insert into inventariado.administradores (usuario_id) values ('00000000-0000-0000-0000-00000000000c');

-- Los negocios anteriores a esta fase recibieron prueba de 14 días.
do $$
declare
  s inventariado.suscripciones;
begin
  select * into s from inventariado.suscripciones where negocio_id = current_setting('pruebas.negocio_ana')::uuid;
  if s is null or s.plan_id <> 'pro' or inventariado.estado_suscripcion(s) <> 'prueba'
     or s.prueba_hasta < now() + interval '13 days' then
    raise exception 'FALLA: suscripción de prueba incorrecta: %', s;
  end if;
end;
$$;

-- Un negocio nuevo recibe su suscripción de prueba automáticamente.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000d', 'dani@ejemplo.cl');
select pg_temp.como('00000000-0000-0000-0000-00000000000d');
select inventariado.crear_negocio('Minimarket Dani', null, null, gen_random_uuid(), 'Dani', 'x') as negocio_dani \gset
reset role;
select set_config('pruebas.negocio_dani', :'negocio_dani', false);
do $$
begin
  if not exists (select 1 from inventariado.suscripciones
                  where negocio_id = current_setting('pruebas.negocio_dani')::uuid and plan_id = 'pro') then
    raise exception 'FALLA: el negocio nuevo no tiene suscripción de prueba';
  end if;
end;
$$;

-- Estados según fechas.
do $$
declare
  s inventariado.suscripciones;
begin
  s.suspendida := false;
  s.prueba_hasta := now() - interval '1 day';
  s.pagado_hasta := null;
  if inventariado.estado_suscripcion(s) <> 'vencida' then raise exception 'FALLA: debería estar vencida'; end if;
  s.prueba_hasta := now() - interval '8 days';
  if inventariado.estado_suscripcion(s) <> 'suspendida' then raise exception 'FALLA: debería estar suspendida'; end if;
  s.pagado_hasta := now() + interval '1 day';
  if inventariado.estado_suscripcion(s) <> 'activa' then raise exception 'FALLA: debería estar activa'; end if;
  s.suspendida := true;
  if inventariado.estado_suscripcion(s) <> 'suspendida' then raise exception 'FALLA: suspensión manual'; end if;
end;
$$;

-- Límite de teléfonos: Ana (Pro en prueba, 5) ya tiene 1; con plan Básico (2) puede uno más.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select inventariado.admin_actualizar_suscripcion(:'negocio_ana', 'basico');
reset role;

select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select inventariado.registrar_dispositivo('10000000-0000-0000-0000-0000000000d2', :'negocio_ana', 'Caja 2');
do $$
begin
  perform inventariado.registrar_dispositivo('10000000-0000-0000-0000-0000000000d3',
    current_setting('pruebas.negocio_ana')::uuid, 'Caja 3');
  raise exception 'FALLA: se superó el límite de teléfonos';
exception when raise_exception then
  if sqlerrm <> 'LIMITE_DISPOSITIVOS' then raise; end if;
end;
$$;

-- La sincronización tampoco puede colar un teléfono nuevo sin cupo.
do $$
begin
  insert into inventariado.dispositivos (id, negocio_id, nombre)
  values ('10000000-0000-0000-0000-0000000000d4', current_setting('pruebas.negocio_ana')::uuid, 'Colado')
  on conflict (id) do update set nombre = excluded.nombre;
  raise exception 'FALLA: un upsert coló un teléfono sobre el límite';
exception when raise_exception then
  if sqlerrm <> 'LIMITE_DISPOSITIVOS' then raise; end if;
end;
$$;

-- Pero un teléfono ya registrado sigue sincronizando normalmente.
insert into inventariado.dispositivos (id, negocio_id, nombre)
values ('10000000-0000-0000-0000-0000000000d1', :'negocio_ana', 'Caja principal')
on conflict (id) do update set nombre = excluded.nombre;

-- Desvincular libera cupo; el teléfono desvinculado no se reactiva solo al sincronizar.
select inventariado.desvincular_dispositivo('10000000-0000-0000-0000-0000000000d2');
insert into inventariado.dispositivos (id, negocio_id, nombre, eliminado)
values ('10000000-0000-0000-0000-0000000000d2', :'negocio_ana', 'Caja 2', false)
on conflict (id) do update set nombre = excluded.nombre, eliminado = excluded.eliminado;
do $$
declare
  d jsonb := inventariado.mis_dispositivos(current_setting('pruebas.negocio_ana')::uuid);
begin
  if (select eliminado from inventariado.dispositivos where id = '10000000-0000-0000-0000-0000000000d2') is not true then
    raise exception 'FALLA: el teléfono desvinculado se reactivó al sincronizar';
  end if;
  if (d->>'limite')::int <> 2 or jsonb_array_length(d->'dispositivos') <> 1 then
    raise exception 'FALLA: mis_dispositivos incorrecto: %', d;
  end if;
end;
$$;
-- Volver a iniciar sesión en ese teléfono sí lo reactiva (hay cupo).
select inventariado.registrar_dispositivo('10000000-0000-0000-0000-0000000000d2', :'negocio_ana', 'Caja 2');

-- Ana no es administradora ni puede modificar su suscripción.
do $$
begin
  if inventariado.es_admin() then raise exception 'FALLA: Ana es admin'; end if;
  perform inventariado.admin_listar_negocios();
  raise exception 'FALLA: Ana listó negocios';
exception when insufficient_privilege then
  null;
end;
$$;
do $$
begin
  update inventariado.suscripciones set pagado_hasta = now() + interval '10 years';
  raise exception 'FALLA: Ana modificó su suscripción';
exception when insufficient_privilege then
  null;
end;
$$;
do $$
begin
  if (select count(*) from inventariado.suscripciones) <> 1 then
    raise exception 'FALLA: Ana ve suscripciones ajenas';
  end if;
  if jsonb_array_length((inventariado.sincronizar_descarga('suscripciones',
       current_setting('pruebas.negocio_ana')::uuid))->'filas') <> 1 then
    raise exception 'FALLA: la suscripción no se descarga';
  end if;
end;
$$;
reset role;

-- Beto no ve los teléfonos de Ana ni puede desvincularlos.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$
begin
  if inventariado.mis_dispositivos(current_setting('pruebas.negocio_ana')::uuid) is not null then
    raise exception 'FALLA: Beto vio los teléfonos de Ana';
  end if;
  perform inventariado.desvincular_dispositivo('10000000-0000-0000-0000-0000000000d1');
  raise exception 'FALLA: Beto desvinculó un teléfono de Ana';
exception when no_data_found then
  null;
end;
$$;
reset role;

-- La administradora lista negocios, registra un pago y suspende.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$
declare
  lista jsonb := inventariado.admin_listar_negocios();
  ana jsonb;
  hasta timestamptz;
begin
  if jsonb_array_length(lista) <> 3 then
    raise exception 'FALLA: la admin debería ver 3 negocios: %', lista;
  end if;
  select x into ana from jsonb_array_elements(lista) x where x->>'nombre' like 'Botillería Ana%';
  if ana->>'correo' <> 'ana@ejemplo.cl' or (ana->>'dispositivos')::int <> 2 or ana->>'estado' <> 'prueba' then
    raise exception 'FALLA: datos de Ana en el listado: %', ana;
  end if;

  -- El pago se suma después de la prueba: no se pierden los días gratis.
  hasta := inventariado.admin_registrar_pago(current_setting('pruebas.negocio_ana')::uuid, 'pro', 1, 19990, 'Transferencia');
  if hasta < now() + interval '13 days' + interval '28 days' then
    raise exception 'FALLA: el pago no respetó los días de prueba: %', hasta;
  end if;

  perform inventariado.admin_actualizar_suscripcion(current_setting('pruebas.negocio_beto')::uuid, p_suspendida => true);
  if (select inventariado.estado_suscripcion(s) from inventariado.suscripciones s
       where s.negocio_id = current_setting('pruebas.negocio_beto')::uuid) <> 'suspendida' then
    raise exception 'FALLA: Beto no quedó suspendido';
  end if;
end;
$$;
reset role;

do $$
begin
  if (select count(*) from inventariado.pagos_suscripcion
       where negocio_id = current_setting('pruebas.negocio_ana')::uuid
         and registrado_por = '00000000-0000-0000-0000-00000000000c') <> 1 then
    raise exception 'FALLA: no se registró el pago';
  end if;
end;
$$;

-- Ana ve su suscripción activa y su pago.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$
begin
  if (select count(*) from inventariado.pagos_suscripcion) <> 1 then
    raise exception 'FALLA: Ana no ve su pago';
  end if;
  if (select inventariado.estado_suscripcion(s) from inventariado.suscripciones s) <> 'activa' then
    raise exception 'FALLA: Ana debería estar activa tras pagar';
  end if;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
\o
\echo 'Todas las pruebas SQL de fase 5 pasaron'
