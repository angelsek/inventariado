-- Pruebas de la migración editor_roles: los choques entre equipos sin internet (nombre
-- repetido, eliminar un rol con personas, asignar un rol eliminado) no son errores.
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

-- Ejecuta una sentencia y exige que falle con el SQLSTATE indicado.
create function pg_temp.debe_fallar(p_sql text, p_estado text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALLA: no falló y debía fallar: %', p_sql;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'FALLA:%' then raise; end if;
  if sqlstate <> p_estado then
    raise exception 'FALLA: % dio SQLSTATE % (%) y se esperaba %', p_sql, sqlstate, sqlerrm, p_estado;
  end if;
end;
$$;

create function pg_temp.nombre_de(p_id uuid) returns text language sql as $$
  select nombre from inventariado.roles where id = p_id;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a9', 'ines@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000b9', 'juan@ejemplo.cl');

select pg_temp.como('00000000-0000-0000-0000-0000000000a9');
select inventariado.crear_negocio('Almacén Inés', null, null,
  '30000000-0000-0000-0000-0000000000a9', 'Inés', 'hash-ines') as negocio_ines \gset
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000b9');
select inventariado.crear_negocio('Botillería Juan', null, null,
  '30000000-0000-0000-0000-0000000000b9', 'Juan', 'hash-juan') as negocio_juan \gset
reset role;
select set_config('pruebas.negocio_ines', :'negocio_ines', false);

select id as rol_cajero_ines from inventariado.roles
 where negocio_id = :'negocio_ines' and predefinido = 'cajero' \gset
select id as rol_bodeguero_ines from inventariado.roles
 where negocio_id = :'negocio_ines' and predefinido = 'bodeguero' \gset
select id as rol_cajero_juan from inventariado.roles
 where negocio_id = :'negocio_juan' and predefinido = 'cajero' \gset
select set_config('pruebas.rol_cajero_ines', :'rol_cajero_ines', false);
select set_config('pruebas.rol_bodeguero_ines', :'rol_bodeguero_ines', false);

select pg_temp.como('00000000-0000-0000-0000-0000000000a9');

-- ---------------------------------------------------------------------------
-- Nombre repetido: dos equipos crean "Reponedor" sin internet
-- ---------------------------------------------------------------------------

insert into inventariado.roles (id, negocio_id, nombre, permisos) values
  ('50000000-0000-0000-0000-000000000001', :'negocio_ines', 'Reponedor', '["stock"]');
insert into inventariado.roles (id, negocio_id, nombre, permisos) values
  ('50000000-0000-0000-0000-000000000002', :'negocio_ines', 'REPONEDOR', '["mercaderia"]');
insert into inventariado.roles (id, negocio_id, nombre, permisos) values
  ('50000000-0000-0000-0000-000000000003', :'negocio_ines', ' reponedor ', '[]');
-- El mismo nombre en otro negocio no choca.
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000b9');
insert into inventariado.roles (id, negocio_id, nombre, permisos) values
  ('50000000-0000-0000-0000-000000000004', :'negocio_juan', 'Reponedor', '[]');
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000a9');

do $$
begin
  if pg_temp.nombre_de('50000000-0000-0000-0000-000000000001') <> 'Reponedor'
     or pg_temp.nombre_de('50000000-0000-0000-0000-000000000002') <> 'REPONEDOR (2)'
     or pg_temp.nombre_de('50000000-0000-0000-0000-000000000003') <> 'reponedor (3)' then
    raise exception 'FALLA: los nombres repetidos no se numeraron: %, %, %',
      pg_temp.nombre_de('50000000-0000-0000-0000-000000000001'),
      pg_temp.nombre_de('50000000-0000-0000-0000-000000000002'),
      pg_temp.nombre_de('50000000-0000-0000-0000-000000000003');
  end if;
end;
$$;

reset role;
do $$
begin
  if pg_temp.nombre_de('50000000-0000-0000-0000-000000000004') <> 'Reponedor' then
    raise exception 'FALLA: el nombre de otro negocio se numeró';
  end if;
end;
$$;
select pg_temp.como('00000000-0000-0000-0000-0000000000a9');

-- También contra un predefinido, y con un nombre de 40 letras se recorta la base.
insert into inventariado.roles (id, negocio_id, nombre, permisos) values
  ('50000000-0000-0000-0000-000000000005', :'negocio_ines', 'cajero', '[]'),
  ('50000000-0000-0000-0000-000000000006', :'negocio_ines', repeat('a', 40), '[]');
insert into inventariado.roles (id, negocio_id, nombre, permisos) values
  ('50000000-0000-0000-0000-000000000007', :'negocio_ines', repeat('A', 40), '[]');
do $$
begin
  if pg_temp.nombre_de('50000000-0000-0000-0000-000000000005') <> 'cajero (2)' then
    raise exception 'FALLA: el nombre repetido con un predefinido no se numeró';
  end if;
  if pg_temp.nombre_de('50000000-0000-0000-0000-000000000007') <> repeat('A', 36) || ' (2)' then
    raise exception 'FALLA: el nombre largo no se recortó: %',
      pg_temp.nombre_de('50000000-0000-0000-0000-000000000007');
  end if;
end;
$$;

-- Renombrar a un nombre ocupado también numera; renombrar a sí mismo (mayúsculas) no.
update inventariado.roles set nombre = 'Reponedor' where id = '50000000-0000-0000-0000-000000000005';
update inventariado.roles set nombre = 'reponedor' where id = '50000000-0000-0000-0000-000000000001';
do $$
begin
  if pg_temp.nombre_de('50000000-0000-0000-0000-000000000005') <> 'Reponedor (4)' then
    raise exception 'FALLA: renombrar a un nombre ocupado dio %',
      pg_temp.nombre_de('50000000-0000-0000-0000-000000000005');
  end if;
  if pg_temp.nombre_de('50000000-0000-0000-0000-000000000001') <> 'reponedor' then
    raise exception 'FALLA: cambiar las mayúsculas del propio nombre lo numeró';
  end if;
end;
$$;

-- El upsert de la app (mismo id, mismo nombre) no se numera a sí mismo.
insert into inventariado.roles (id, negocio_id, nombre, permisos)
values ('50000000-0000-0000-0000-000000000002', :'negocio_ines', 'REPONEDOR (2)', '["stock"]')
on conflict (id) do update set nombre = excluded.nombre, permisos = excluded.permisos;
do $$
begin
  if pg_temp.nombre_de('50000000-0000-0000-0000-000000000002') <> 'REPONEDOR (2)' then
    raise exception 'FALLA: el upsert de un rol existente cambió su nombre';
  end if;
end;
$$;

-- Un rol eliminado no ocupa su nombre; al volver (otro equipo lo editó), se numera.
update inventariado.roles set eliminado = true where id = '50000000-0000-0000-0000-000000000003';
insert into inventariado.roles (id, negocio_id, nombre, permisos) values
  ('50000000-0000-0000-0000-000000000008', :'negocio_ines', 'Reponedor (3)', '[]');
update inventariado.roles set eliminado = false where id = '50000000-0000-0000-0000-000000000003';
do $$
begin
  if pg_temp.nombre_de('50000000-0000-0000-0000-000000000008') <> 'Reponedor (3)'
     or pg_temp.nombre_de('50000000-0000-0000-0000-000000000003') <> 'reponedor (3) (2)' then
    raise exception 'FALLA: el rol que volvió no se numeró: %',
      pg_temp.nombre_de('50000000-0000-0000-0000-000000000003');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Predefinidos: se cambian sus permisos y nombre, pero no se eliminan
-- ---------------------------------------------------------------------------

update inventariado.roles set permisos = '["vender"]', nombre = 'Caja'
 where id = current_setting('pruebas.rol_cajero_ines')::uuid;
do $$
begin
  if (select permisos from inventariado.roles where id = current_setting('pruebas.rol_cajero_ines')::uuid)
     <> '["vender"]'::jsonb then
    raise exception 'FALLA: no se pudieron cambiar los permisos de un predefinido';
  end if;
end;
$$;
select pg_temp.debe_fallar(
  format($q$update inventariado.roles set eliminado = true where id = %L$q$,
         current_setting('pruebas.rol_bodeguero_ines')),
  '42501');

-- ---------------------------------------------------------------------------
-- Eliminar un rol que otro equipo ya asignó: no se elimina y no es error
-- ---------------------------------------------------------------------------

insert into inventariado.perfiles (id, negocio_id, nombre, rol, rol_id, pin_hash) values
  ('60000000-0000-0000-0000-000000000001', :'negocio_ines', 'Kati', 'cajero',
   '50000000-0000-0000-0000-000000000001', 'h');
-- La subida de la app es un upsert.
insert into inventariado.roles (id, negocio_id, nombre, permisos, eliminado)
values ('50000000-0000-0000-0000-000000000001', :'negocio_ines', 'reponedor', '["stock"]', true)
on conflict (id) do update set eliminado = excluded.eliminado;
do $$
begin
  if (select eliminado from inventariado.roles where id = '50000000-0000-0000-0000-000000000001') then
    raise exception 'FALLA: se eliminó un rol con personas';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Asignar un rol que otro equipo ya eliminó
-- ---------------------------------------------------------------------------

update inventariado.roles set eliminado = true where id = '50000000-0000-0000-0000-000000000008';

-- Una persona nueva con ese rol queda como Cajero.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, rol_id, pin_hash) values
  ('60000000-0000-0000-0000-000000000002', :'negocio_ines', 'Lalo', 'cajero',
   '50000000-0000-0000-0000-000000000008', 'h');
-- Una persona que ya existe conserva su rol, con update y con el upsert de la app.
update inventariado.perfiles set rol_id = '50000000-0000-0000-0000-000000000008'
 where id = '60000000-0000-0000-0000-000000000001';
insert into inventariado.perfiles (id, negocio_id, nombre, rol, rol_id, pin_hash)
values ('60000000-0000-0000-0000-000000000001', :'negocio_ines', 'Kati', 'cajero',
        '50000000-0000-0000-0000-000000000008', 'h')
on conflict (id) do update set rol_id = excluded.rol_id;
do $$
begin
  if (select rol_id from inventariado.perfiles where id = '60000000-0000-0000-0000-000000000002')
     is distinct from current_setting('pruebas.rol_cajero_ines')::uuid then
    raise exception 'FALLA: la persona nueva con un rol eliminado no quedó como Cajero';
  end if;
  if (select rol_id from inventariado.perfiles where id = '60000000-0000-0000-0000-000000000001')
     is distinct from '50000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'FALLA: la persona perdió su rol al asignarle uno eliminado';
  end if;
end;
$$;

-- Un rol de otro negocio sigue siendo error.
select pg_temp.debe_fallar(
  format($q$update inventariado.perfiles set rol_id = %L
             where id = '60000000-0000-0000-0000-000000000001'$q$, :'rol_cajero_juan'),
  '23503');
reset role;

select 'Todas las pruebas SQL del editor de roles pasaron';
