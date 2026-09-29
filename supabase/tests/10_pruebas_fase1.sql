-- Pruebas de la migración de fase 1. Cada bloque falla con una excepción si algo no cuadra.
\set ON_ERROR_STOP on
\o /dev/null

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@ejemplo.cl'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@ejemplo.cl');

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

-- Ana y Beto crean cada uno su negocio.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.crear_negocio('Botillería Ana', '11.111.111-1', 'Calle 1',
  '10000000-0000-0000-0000-000000000001', 'Ana', 'hash-ana') as negocio_ana \gset
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select public.crear_negocio('Almacén Beto', '', '',
  '20000000-0000-0000-0000-000000000001', 'Beto', 'hash-beto') as negocio_beto \gset
reset role;

select set_config('pruebas.negocio_ana', :'negocio_ana', false);
select set_config('pruebas.negocio_beto', :'negocio_beto', false);

-- Una cuenta no puede crear un segundo negocio.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$
begin
  perform public.crear_negocio('Otro', null, null, gen_random_uuid(), 'Ana', 'x');
  raise exception 'FALLA: se permitió un segundo negocio';
exception when unique_violation then
  null;
end;
$$;
reset role;

-- Ana solo ve su negocio y sus perfiles.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$
begin
  if (select count(*) from public.negocios) <> 1 then
    raise exception 'FALLA: Ana ve % negocios', (select count(*) from public.negocios);
  end if;
  if (select nombre from public.negocios) <> 'Botillería Ana' then
    raise exception 'FALLA: Ana ve un negocio ajeno';
  end if;
  if (select count(*) from public.perfiles where rol = 'dueno') <> 1 then
    raise exception 'FALLA: no se creó el perfil del dueño';
  end if;
  if (select rut from public.negocios) <> '11.111.111-1' then
    raise exception 'FALLA: RUT no guardado';
  end if;
end;
$$;

-- Ana agrega un cajero y registra un dispositivo con upsert.
insert into public.perfiles (id, negocio_id, nombre, rol, pin_hash)
values ('10000000-0000-0000-0000-000000000002', :'negocio_ana', 'Carla', 'cajero', 'hash-carla');
insert into public.dispositivos (id, negocio_id, nombre)
values ('10000000-0000-0000-0000-0000000000d1', :'negocio_ana', 'Caja 1')
on conflict (id) do update set nombre = excluded.nombre, negocio_id = excluded.negocio_id;
insert into public.dispositivos (id, negocio_id, nombre)
values ('10000000-0000-0000-0000-0000000000d1', :'negocio_ana', 'Caja principal')
on conflict (id) do update set nombre = excluded.nombre, negocio_id = excluded.negocio_id;

-- Ana puede actualizar su negocio con upsert (así sube cambios la app)...
insert into public.negocios (id, nombre, rut, direccion)
values (:'negocio_ana', 'Botillería Ana SpA', '11.111.111-1', 'Calle 1')
on conflict (id) do update set nombre = excluded.nombre;
do $$
begin
  if (select nombre from public.negocios) <> 'Botillería Ana SpA' then
    raise exception 'FALLA: el upsert del negocio no se aplicó';
  end if;
end;
$$;

-- ...pero no crear negocios por fuera de crear_negocio().
do $$
begin
  insert into public.negocios (nombre) values ('Negocio pirata');
  raise exception 'FALLA: se creó un negocio con insert directo';
exception when insufficient_privilege then
  null;
end;
$$;

-- Ana no puede escribir en el negocio de Beto.
do $$
begin
  insert into public.perfiles (negocio_id, nombre, rol, pin_hash)
  values (current_setting('pruebas.negocio_beto')::uuid, 'Intruso', 'cajero', 'x');
  raise exception 'FALLA: Ana escribió en el negocio de Beto';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;

-- Sincronización: primera descarga, cursor y cambios posteriores.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select public.sincronizar_descarga('perfiles', :'negocio_ana') as descarga1 \gset
select set_config('pruebas.d1', :'descarga1', false);
do $$
declare
  d jsonb := current_setting('pruebas.d1')::jsonb;
begin
  if jsonb_array_length(d->'filas') <> 2 then
    raise exception 'FALLA: primera descarga trae % perfiles', jsonb_array_length(d->'filas');
  end if;
  if (d->'filas'->0) ? 'sync_xid' then
    raise exception 'FALLA: la descarga expone sync_xid';
  end if;
end;
$$;
reset role;

-- Un cambio posterior aparece en la siguiente descarga; lo no modificado no.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
update public.perfiles set nombre = 'Carla P.' where nombre = 'Carla';
do $$
declare
  cursor1 text := current_setting('pruebas.d1')::jsonb->>'cursor';
  d jsonb := public.sincronizar_descarga('perfiles', current_setting('pruebas.negocio_ana')::uuid, cursor1);
begin
  if not exists (select 1 from jsonb_array_elements(d->'filas') f where f->>'nombre' = 'Carla P.') then
    raise exception 'FALLA: el cambio no aparece en la descarga incremental: %', d;
  end if;
  if exists (select 1 from jsonb_array_elements(d->'filas') f where f->>'nombre' = 'Ana') then
    raise exception 'FALLA: la descarga incremental trae filas sin cambios';
  end if;
end;
$$;

-- Ana no puede descargar datos de Beto aunque pida su negocio_id.
do $$
declare
  d jsonb := public.sincronizar_descarga('perfiles', current_setting('pruebas.negocio_beto')::uuid);
begin
  if jsonb_array_length(d->'filas') <> 0 then
    raise exception 'FALLA: Ana descargó perfiles de Beto';
  end if;
end;
$$;

-- Tablas fuera de la lista se rechazan.
do $$
begin
  perform public.sincronizar_descarga('negocio_usuarios', current_setting('pruebas.negocio_ana')::uuid);
  raise exception 'FALLA: se aceptó una tabla no sincronizable';
exception when invalid_parameter_value then
  null;
end;
$$;

-- actualizado_en y sync_xid no se pueden falsificar desde la app.
update public.dispositivos set nombre = 'Caja 1', actualizado_en = '2000-01-01'
where id = '10000000-0000-0000-0000-0000000000d1';
do $$
begin
  if (select actualizado_en from public.dispositivos
      where id = '10000000-0000-0000-0000-0000000000d1') < now() - interval '1 minute' then
    raise exception 'FALLA: se aceptó un actualizado_en falso';
  end if;
end;
$$;
reset role;

-- Sin sesión no se ve ni se ejecuta nada.
select pg_temp.como(null);
do $$
begin
  if (select count(*) from public.negocios) <> 0 then
    raise exception 'FALLA: anon ve negocios';
  end if;
end;
$$;
do $$
begin
  perform public.crear_negocio('X', null, null, gen_random_uuid(), 'X', 'x');
  raise exception 'FALLA: anon pudo crear un negocio';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
\o
\echo 'Todas las pruebas SQL de fase 1 pasaron'
