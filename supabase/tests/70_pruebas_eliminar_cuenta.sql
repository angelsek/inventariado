-- Pruebas de eliminación de cuenta (corre al final: borra el negocio de Ana).
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

-- Ana tiene datos en casi todas las tablas (de las pruebas anteriores).
do $$
begin
  if (select count(*) from inventariado.ventas where negocio_id = current_setting('pruebas.negocio_ana')::uuid) = 0 then
    raise exception 'FALLA: se esperaban datos previos de Ana';
  end if;
end;
$$;

-- Beto no puede eliminar el negocio de Ana.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$
begin
  perform inventariado.eliminar_mi_negocio(current_setting('pruebas.negocio_ana')::uuid);
  raise exception 'FALLA: Beto eliminó el negocio de Ana';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;

-- Ana elimina su negocio: no queda ningún dato suyo.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select inventariado.eliminar_mi_negocio(:'negocio_ana');
reset role;

do $$
declare
  t text;
  n integer;
begin
  for t in
    select c.table_name from information_schema.columns c
     where c.table_schema = 'inventariado' and c.column_name = 'negocio_id'
  loop
    execute format('select count(*) from inventariado.%I where negocio_id = $1', t)
      into n using current_setting('pruebas.negocio_ana')::uuid;
    if n <> 0 then
      raise exception 'FALLA: quedaron % filas de Ana en %', n, t;
    end if;
  end loop;
  if exists (select 1 from inventariado.negocios where id = current_setting('pruebas.negocio_ana')::uuid) then
    raise exception 'FALLA: el negocio de Ana sigue existiendo';
  end if;
  -- Los datos de Beto siguen intactos.
  if not exists (select 1 from inventariado.negocios where nombre = 'Almacén Beto') then
    raise exception 'FALLA: se borró el negocio de Beto';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '', false);
\o
\echo 'Todas las pruebas SQL de eliminación de cuenta pasaron'
