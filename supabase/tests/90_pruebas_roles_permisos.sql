-- Pruebas de la migración roles_permisos: roles por negocio, perfiles con rol_id e integridad
-- (dueño protegido, sin segundo dueño, roles de otro negocio, roles con personas).
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

-- Ejecuta una sentencia y exige que falle con el SQLSTATE indicado (y, si se da, con ese mensaje).
create function pg_temp.debe_fallar(p_sql text, p_estado text, p_mensaje text default null)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALLA: no falló y debía fallar: %', p_sql;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'FALLA:%' then raise; end if;
  if sqlstate <> p_estado then
    raise exception 'FALLA: % dio SQLSTATE % (%) y se esperaba %', p_sql, sqlstate, sqlerrm, p_estado;
  end if;
  if p_mensaje is not null and sqlerrm <> p_mensaje then
    raise exception 'FALLA: % dio el mensaje "%" y se esperaba "%"', p_sql, sqlerrm, p_mensaje;
  end if;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'fabi@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000f2', 'gabo@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000f3', 'hugo@ejemplo.cl');

-- ---------------------------------------------------------------------------
-- Un negocio nuevo nace con sus 3 roles predefinidos
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select inventariado.crear_negocio('Kiosko Fabi', null, null,
  '30000000-0000-0000-0000-0000000000f1', 'Fabi', 'hash-fabi') as negocio_fabi \gset
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
select inventariado.crear_negocio('Bazar Gabo', null, null,
  '30000000-0000-0000-0000-0000000000f2', 'Gabo', 'hash-gabo') as negocio_gabo \gset
reset role;
select set_config('pruebas.negocio_fabi', :'negocio_fabi', false);
select set_config('pruebas.negocio_gabo', :'negocio_gabo', false);

do $$
declare
  n uuid := current_setting('pruebas.negocio_fabi')::uuid;
begin
  if (select count(*) from inventariado.roles where negocio_id = n) <> 3 then
    raise exception 'FALLA: el negocio nuevo no tiene 3 roles (%)',
      (select count(*) from inventariado.roles where negocio_id = n);
  end if;
  if (select array_agg(predefinido order by predefinido) from inventariado.roles where negocio_id = n)
     <> array['administrador', 'bodeguero', 'cajero'] then
    raise exception 'FALLA: roles predefinidos incorrectos';
  end if;
  if (select nombre from inventariado.roles where negocio_id = n and predefinido = 'cajero') <> 'Cajero'
     or (select nombre from inventariado.roles where negocio_id = n and predefinido = 'administrador') <> 'Administrador'
     or (select nombre from inventariado.roles where negocio_id = n and predefinido = 'bodeguero') <> 'Bodeguero' then
    raise exception 'FALLA: nombres de roles predefinidos incorrectos';
  end if;
  if (select permisos from inventariado.roles where negocio_id = n and predefinido = 'cajero')
     <> '["vender", "ventas_ver", "caja", "fiado"]'::jsonb then
    raise exception 'FALLA: permisos del Cajero incorrectos';
  end if;
  if (select permisos from inventariado.roles where negocio_id = n and predefinido = 'bodeguero')
     <> '["productos_editar", "mercaderia", "stock"]'::jsonb then
    raise exception 'FALLA: permisos del Bodeguero incorrectos';
  end if;
  if jsonb_array_length((select permisos from inventariado.roles where negocio_id = n and predefinido = 'administrador')) <> 15 then
    raise exception 'FALLA: el Administrador no tiene los 15 permisos';
  end if;
  if (select rol_id from inventariado.perfiles where negocio_id = n and rol = 'dueno') is not null then
    raise exception 'FALLA: el dueño quedó con rol_id';
  end if;
end;
$$;

-- Los roles de Gabo son otros (no se comparten entre negocios).
do $$
begin
  if exists (
    select 1 from inventariado.roles a join inventariado.roles b on a.id = b.id
     where a.negocio_id = current_setting('pruebas.negocio_fabi')::uuid
       and b.negocio_id = current_setting('pruebas.negocio_gabo')::uuid
  ) or (select count(*) from inventariado.roles where negocio_id = current_setting('pruebas.negocio_gabo')::uuid) <> 3 then
    raise exception 'FALLA: Gabo no tiene sus propios 3 roles';
  end if;
end;
$$;

select id as rol_cajero_fabi from inventariado.roles
 where negocio_id = :'negocio_fabi' and predefinido = 'cajero' \gset
select id as rol_bodeguero_fabi from inventariado.roles
 where negocio_id = :'negocio_fabi' and predefinido = 'bodeguero' \gset
select id as rol_cajero_gabo from inventariado.roles
 where negocio_id = :'negocio_gabo' and predefinido = 'cajero' \gset
select id as dueno_fabi from inventariado.perfiles
 where negocio_id = :'negocio_fabi' and rol = 'dueno' \gset

-- ---------------------------------------------------------------------------
-- Perfiles: rol_id por defecto y validación
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');

-- Una APK vieja inserta un cajero sin rol_id: queda como Cajero.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
values ('30000000-0000-0000-0000-0000000000c1', :'negocio_fabi', 'Carla', 'cajero', 'h');
-- La APK nueva inserta con rol_id explícito: se respeta.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, rol_id, pin_hash)
values ('30000000-0000-0000-0000-0000000000c2', :'negocio_fabi', 'Beto', 'cajero',
        :'rol_bodeguero_fabi', 'h');
reset role;

do $$
begin
  if (select rol_id from inventariado.perfiles where id = '30000000-0000-0000-0000-0000000000c1')
     is distinct from (select id from inventariado.roles
                        where negocio_id = current_setting('pruebas.negocio_fabi')::uuid and predefinido = 'cajero') then
    raise exception 'FALLA: el cajero sin rol_id no quedó con el rol Cajero';
  end if;
  if (select rol_id from inventariado.perfiles where id = '30000000-0000-0000-0000-0000000000c2')
     is distinct from (select id from inventariado.roles
                        where negocio_id = current_setting('pruebas.negocio_fabi')::uuid and predefinido = 'bodeguero') then
    raise exception 'FALLA: el rol_id explícito no se respetó';
  end if;
end;
$$;

-- Cambiar el rol de una persona funciona (como lo hace asignarRol de la app).
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
update inventariado.perfiles set rol_id = :'rol_bodeguero_fabi'
 where id = '30000000-0000-0000-0000-0000000000c1';
reset role;
select set_config('pruebas.rol_bodeguero_fabi', :'rol_bodeguero_fabi', false);
select set_config('pruebas.rol_cajero_fabi', :'rol_cajero_fabi', false);
select set_config('pruebas.rol_cajero_gabo', :'rol_cajero_gabo', false);
select set_config('pruebas.dueno_fabi', :'dueno_fabi', false);
do $$
begin
  if (select rol_id from inventariado.perfiles where id = '30000000-0000-0000-0000-0000000000c1')
     <> current_setting('pruebas.rol_bodeguero_fabi')::uuid then
    raise exception 'FALLA: no se pudo cambiar el rol de una persona';
  end if;
end;
$$;

-- Un rol de otro negocio se rechaza, al insertar y al actualizar.
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (id, negocio_id, nombre, rol, rol_id, pin_hash)
            values (gen_random_uuid(), %L, 'Intruso', 'cajero', %L, 'h')$q$,
         current_setting('pruebas.negocio_fabi'), current_setting('pruebas.rol_cajero_gabo')),
  '23503', 'El rol no es de este negocio');
select pg_temp.debe_fallar(
  format($q$update inventariado.perfiles set rol_id = %L
             where id = '30000000-0000-0000-0000-0000000000c1'$q$,
         current_setting('pruebas.rol_cajero_gabo')),
  '23503', 'El rol no es de este negocio');
-- Un rol que no existe también.
select pg_temp.debe_fallar(
  $q$update inventariado.perfiles set rol_id = gen_random_uuid()
      where id = '30000000-0000-0000-0000-0000000000c1'$q$,
  '23503');
-- Un perfil no se puede mover a otro negocio.
select pg_temp.debe_fallar(
  format($q$update inventariado.perfiles set negocio_id = %L
             where id = '30000000-0000-0000-0000-0000000000c1'$q$,
         current_setting('pruebas.negocio_gabo')),
  '42501');
reset role;

-- ---------------------------------------------------------------------------
-- El dueño no se degrada, desactiva ni elimina; no hay segundo dueño
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.debe_fallar(
  format($q$update inventariado.perfiles set rol = 'cajero' where id = %L$q$,
         current_setting('pruebas.dueno_fabi')),
  '42501');
select pg_temp.debe_fallar(
  format($q$update inventariado.perfiles set activo = false where id = %L$q$,
         current_setting('pruebas.dueno_fabi')),
  '42501');
select pg_temp.debe_fallar(
  format($q$update inventariado.perfiles set eliminado = true where id = %L$q$,
         current_setting('pruebas.dueno_fabi')),
  '42501');
-- La app no tiene permiso de borrar filas.
select pg_temp.debe_fallar(
  format($q$delete from inventariado.perfiles where id = %L$q$, current_setting('pruebas.dueno_fabi')),
  '42501');

-- Cambiar el nombre o el PIN del dueño sí se puede.
update inventariado.perfiles set nombre = 'Fabiola', pin_hash = 'hash-nuevo'
 where id = :'dueno_fabi';

-- Darle un rol al dueño no deja rol_id (siempre tiene todo).
update inventariado.perfiles set rol_id = :'rol_bodeguero_fabi' where id = :'dueno_fabi';
do $$
begin
  if (select rol_id from inventariado.perfiles where id = current_setting('pruebas.dueno_fabi')::uuid) is not null then
    raise exception 'FALLA: el dueño quedó con un rol_id';
  end if;
end;
$$;

-- El upsert del propio dueño (así sincroniza la app) funciona y no lo cambia.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, rol_id, pin_hash, activo, eliminado)
values (:'dueno_fabi', :'negocio_fabi', 'Fabiola P.', 'dueno', null, 'hash-nuevo', true, false)
on conflict (id) do update set nombre = excluded.nombre, rol = excluded.rol,
  rol_id = excluded.rol_id, pin_hash = excluded.pin_hash, activo = excluded.activo,
  eliminado = excluded.eliminado;
do $$
begin
  if (select nombre from inventariado.perfiles where id = current_setting('pruebas.dueno_fabi')::uuid) <> 'Fabiola P.' then
    raise exception 'FALLA: el upsert del dueño no actualizó el nombre';
  end if;
  if (select count(*) from inventariado.perfiles
       where negocio_id = current_setting('pruebas.negocio_fabi')::uuid and rol = 'dueno') <> 1 then
    raise exception 'FALLA: el upsert del dueño dejó más de un dueño';
  end if;
end;
$$;

-- El upsert del dueño con intención de degradarlo se rechaza.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
            values (%L, %L, 'Fabiola', 'cajero', 'h')
            on conflict (id) do update set rol = excluded.rol$q$,
         current_setting('pruebas.dueno_fabi'), current_setting('pruebas.negocio_fabi')),
  '42501');

-- Un segundo dueño: ni insertándolo ni ascendiendo a un cajero.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
            values (gen_random_uuid(), %L, 'Otro dueño', 'dueno', 'h')$q$,
         current_setting('pruebas.negocio_fabi')),
  '42501', 'Solo puede haber un dueño');
select pg_temp.debe_fallar(
  $q$update inventariado.perfiles set rol = 'dueno'
      where id = '30000000-0000-0000-0000-0000000000c1'$q$,
  '42501', 'Solo puede haber un dueño');
-- Ni convertir a un cajero en dueño con un upsert sobre su id.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
            values ('30000000-0000-0000-0000-0000000000c1', %L, 'Carla', 'dueno', 'h')
            on conflict (id) do update set rol = excluded.rol$q$,
         current_setting('pruebas.negocio_fabi')),
  '42501', 'Solo puede haber un dueño');
reset role;

do $$
begin
  if (select count(*) from inventariado.perfiles
       where negocio_id = current_setting('pruebas.negocio_fabi')::uuid and rol = 'dueno') <> 1 then
    raise exception 'FALLA: quedó más de un dueño';
  end if;
  if (select rol from inventariado.perfiles where id = '30000000-0000-0000-0000-0000000000c1') <> 'cajero' then
    raise exception 'FALLA: se ascendió a un cajero a dueño';
  end if;
  if not (select activo and not eliminado and rol = 'dueno' from inventariado.perfiles
           where id = current_setting('pruebas.dueno_fabi')::uuid) then
    raise exception 'FALLA: el dueño quedó degradado, desactivado o eliminado';
  end if;
end;
$$;

-- Una persona (no dueña) sí se puede desactivar y eliminar.
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
update inventariado.perfiles set activo = false where id = '30000000-0000-0000-0000-0000000000c2';
update inventariado.perfiles set eliminado = true where id = '30000000-0000-0000-0000-0000000000c2';
reset role;

-- ---------------------------------------------------------------------------
-- Roles: permisos válidos
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');

-- Un rol propio del negocio se crea bien (también sin permisos).
insert into inventariado.roles (id, negocio_id, nombre, permisos)
values ('40000000-0000-0000-0000-0000000000a1', :'negocio_fabi', 'Reponedor', '["stock", "mercaderia"]'),
       ('40000000-0000-0000-0000-0000000000a2', :'negocio_fabi', 'Solo mirar', '[]');
do $$
begin
  if (select predefinido from inventariado.roles where id = '40000000-0000-0000-0000-0000000000a1') is not null then
    raise exception 'FALLA: un rol propio quedó como predefinido';
  end if;
end;
$$;

-- Lo que no sea un arreglo de textos se rechaza.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, 'Malo 1', '{"vender": true}')$q$,
         current_setting('pruebas.negocio_fabi')), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, 'Malo 2', '"vender"')$q$,
         current_setting('pruebas.negocio_fabi')), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, 'Malo 3', '[1, 2]')$q$,
         current_setting('pruebas.negocio_fabi')), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, 'Malo 4', '["vender", null]')$q$,
         current_setting('pruebas.negocio_fabi')), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, 'Malo 5', '[["vender"]]')$q$,
         current_setting('pruebas.negocio_fabi')), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, 'Malo 6', 'null'::jsonb)$q$,
         current_setting('pruebas.negocio_fabi')), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, 'Malo 7', null)$q$,
         current_setting('pruebas.negocio_fabi')), '23502');
-- También al actualizar.
select pg_temp.debe_fallar(
  $q$update inventariado.roles set permisos = '{"a": 1}' where id = '40000000-0000-0000-0000-0000000000a1'$q$,
  '23514');
-- Nombre vacío o muy largo.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, '   ', '[]')$q$,
         current_setting('pruebas.negocio_fabi')), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, repeat('x', 41), '[]')$q$,
         current_setting('pruebas.negocio_fabi')), '23514');
-- Nombre repetido (sin importar mayúsculas ni espacios), también contra los predefinidos.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, ' reponedor ', '[]')$q$,
         current_setting('pruebas.negocio_fabi')), '23505');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, 'CAJERO', '[]')$q$,
         current_setting('pruebas.negocio_fabi')), '23505');
reset role;

-- ---------------------------------------------------------------------------
-- La app no crea ni cambia roles predefinidos
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos, predefinido)
            values (%L, 'Super cajero', '[]', 'cajero')$q$, current_setting('pruebas.negocio_fabi')),
  '42501', 'Los roles predefinidos los crea el sistema');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos, predefinido)
            values (%L, 'Otro admin', '[]', 'administrador')$q$, current_setting('pruebas.negocio_fabi')),
  '42501', 'Los roles predefinidos los crea el sistema');
-- Ni convertir un rol propio en predefinido, ni quitarle lo predefinido a uno del sistema.
select pg_temp.debe_fallar(
  $q$update inventariado.roles set predefinido = 'bodeguero' where id = '40000000-0000-0000-0000-0000000000a1'$q$,
  '42501', 'No se puede cambiar si un rol es predefinido');
select pg_temp.debe_fallar(
  format($q$update inventariado.roles set predefinido = null where id = %L$q$,
         current_setting('pruebas.rol_cajero_fabi')),
  '42501', 'No se puede cambiar si un rol es predefinido');
-- Un rol no se mueve a otro negocio.
select pg_temp.debe_fallar(
  format($q$update inventariado.roles set negocio_id = %L where id = '40000000-0000-0000-0000-0000000000a1'$q$,
         current_setting('pruebas.negocio_gabo')),
  '42501');
reset role;

-- Si se repite crear_roles_predefinidos no se duplican (idempotente).
select inventariado.crear_roles_predefinidos(:'negocio_fabi');
do $$
begin
  if (select count(*) from inventariado.roles
       where negocio_id = current_setting('pruebas.negocio_fabi')::uuid and predefinido is not null) <> 3 then
    raise exception 'FALLA: crear_roles_predefinidos duplicó roles';
  end if;
end;
$$;

-- La app no puede llamar a crear_roles_predefinidos.
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.debe_fallar(
  format($q$select inventariado.crear_roles_predefinidos(%L)$q$, current_setting('pruebas.negocio_gabo')),
  '42501');
reset role;

-- ---------------------------------------------------------------------------
-- No se elimina un rol que tiene personas
-- ---------------------------------------------------------------------------

-- Beto (c2, ya eliminado) no cuenta; Carla (c1) tiene el rol Bodeguero.
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.debe_fallar(
  format($q$update inventariado.roles set eliminado = true where id = %L$q$,
         current_setting('pruebas.rol_bodeguero_fabi')),
  'P0001', 'ROL_CON_PERSONAS');
-- Un rol sin personas se puede eliminar.
update inventariado.roles set eliminado = true where id = '40000000-0000-0000-0000-0000000000a2';
-- Cambiar de rol a la persona permite eliminar el anterior.
update inventariado.perfiles set rol_id = :'rol_cajero_fabi' where id = '30000000-0000-0000-0000-0000000000c1';
update inventariado.roles set eliminado = true where id = :'rol_bodeguero_fabi';
-- Y el nombre de un rol eliminado se puede reutilizar.
insert into inventariado.roles (negocio_id, nombre, permisos) values (:'negocio_fabi', 'Solo mirar', '["stock"]');
-- Desactivar a una persona no basta: sigue teniendo el rol.
update inventariado.perfiles set activo = false where id = '30000000-0000-0000-0000-0000000000c1';
select pg_temp.debe_fallar(
  format($q$update inventariado.roles set eliminado = true where id = %L$q$,
         current_setting('pruebas.rol_cajero_fabi')),
  'P0001', 'ROL_CON_PERSONAS');
reset role;

-- ---------------------------------------------------------------------------
-- RLS: otro negocio no ve ni toca los roles
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f2');
do $$
begin
  if exists (select 1 from inventariado.roles where negocio_id = current_setting('pruebas.negocio_fabi')::uuid) then
    raise exception 'FALLA: Gabo ve roles de Fabi';
  end if;
  if (select count(*) from inventariado.roles) <> 3 then
    raise exception 'FALLA: Gabo no ve exactamente sus 3 roles (%)', (select count(*) from inventariado.roles);
  end if;
end;
$$;
-- Modificar roles de Fabi no afecta ninguna fila.
do $$
declare
  n integer;
begin
  with cambiados as (
    update inventariado.roles set permisos = '["usuarios"]'
     where negocio_id = current_setting('pruebas.negocio_fabi')::uuid returning 1
  )
  select count(*) into n from cambiados;
  if n <> 0 then
    raise exception 'FALLA: Gabo modificó % roles de Fabi', n;
  end if;
end;
$$;
-- Ni crear roles en el negocio de Fabi.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.roles (negocio_id, nombre, permisos) values (%L, 'Colado', '[]')$q$,
         current_setting('pruebas.negocio_fabi')),
  '42501');
-- Ni mover un rol propio al negocio de Fabi.
select pg_temp.debe_fallar(
  format($q$update inventariado.roles set negocio_id = %L where id = %L$q$,
         current_setting('pruebas.negocio_fabi'), current_setting('pruebas.rol_cajero_gabo')),
  '42501');
-- sincronizar_descarga entrega los roles propios con permisos como arreglo, y los de Fabi no.
do $$
declare
  d jsonb := inventariado.sincronizar_descarga('roles', current_setting('pruebas.negocio_gabo')::uuid, null);
  ajeno jsonb := inventariado.sincronizar_descarga('roles', current_setting('pruebas.negocio_fabi')::uuid, null);
begin
  if jsonb_array_length(d->'filas') <> 3 then
    raise exception 'FALLA: sincronizar_descarga(roles) devolvió % filas', jsonb_array_length(d->'filas');
  end if;
  if jsonb_typeof((d->'filas'->0)->'permisos') <> 'array' then
    raise exception 'FALLA: permisos no viaja como arreglo';
  end if;
  if jsonb_array_length(ajeno->'filas') <> 0 then
    raise exception 'FALLA: Gabo descargó roles de Fabi';
  end if;
end;
$$;
reset role;

-- Los roles de Fabi quedaron como estaban.
do $$
begin
  if (select permisos from inventariado.roles where id = current_setting('pruebas.rol_cajero_fabi')::uuid)
     <> '["vender", "ventas_ver", "caja", "fiado"]'::jsonb then
    raise exception 'FALLA: los permisos del Cajero de Fabi cambiaron';
  end if;
end;
$$;

-- Sin sesión no se ven roles.
select pg_temp.como(null);
select pg_temp.debe_fallar('select count(*) from inventariado.roles', '42501');
reset role;

-- ---------------------------------------------------------------------------
-- Datos existentes (negocios y cajeros anteriores a la migración)
-- ---------------------------------------------------------------------------

-- Se deja el negocio de Gabo como estaba antes: sin roles y con un cajero sin rol_id.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
values ('30000000-0000-0000-0000-0000000000d1', :'negocio_gabo', 'Dora', 'cajero', 'h'),
       ('30000000-0000-0000-0000-0000000000d2', :'negocio_gabo', 'Eli', 'cajero', 'h');
update inventariado.perfiles set rol_id = null where negocio_id = :'negocio_gabo';
delete from inventariado.roles where negocio_id = :'negocio_gabo';

-- Y el de Fabi: una cajera sin rol_id y otra con un rol que no es Cajero.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, rol_id, pin_hash)
values ('30000000-0000-0000-0000-0000000000c3', :'negocio_fabi', 'Fran', 'cajero',
        '40000000-0000-0000-0000-0000000000a1', 'h');
update inventariado.perfiles set rol_id = null where id = '30000000-0000-0000-0000-0000000000c1';

-- Se vuelve a ejecutar la migración (como cuando se corre a mano en Supabase).
\ir ../migrations/20261019000100_roles_permisos.sql
\o /dev/null

do $$
declare
  g uuid := current_setting('pruebas.negocio_gabo')::uuid;
begin
  if (select count(*) from inventariado.roles where negocio_id = g and predefinido is not null) <> 3 then
    raise exception 'FALLA: la migración no recreó los roles del negocio existente';
  end if;
  if (select count(*) from inventariado.perfiles p join inventariado.roles r on r.id = p.rol_id
       where p.negocio_id = g and p.rol = 'cajero' and r.predefinido = 'cajero') <> 2 then
    raise exception 'FALLA: los cajeros existentes no pasaron al rol Cajero';
  end if;
  if (select rol_id from inventariado.perfiles where negocio_id = g and rol = 'dueno') is not null then
    raise exception 'FALLA: la migración le dio rol al dueño';
  end if;
  -- Carla recupera Cajero; Fran conserva su rol propio (no se pisan roles ya asignados).
  if (select rol_id from inventariado.perfiles where id = '30000000-0000-0000-0000-0000000000c1')
     <> current_setting('pruebas.rol_cajero_fabi')::uuid then
    raise exception 'FALLA: Carla no volvió al rol Cajero';
  end if;
  if (select rol_id from inventariado.perfiles where id = '30000000-0000-0000-0000-0000000000c3')
     <> '40000000-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'FALLA: la migración pisó un rol ya asignado';
  end if;
  -- Los roles que ya existían no cambian de id ni se duplican.
  if (select count(*) from inventariado.roles
       where negocio_id = current_setting('pruebas.negocio_fabi')::uuid and predefinido is not null) <> 3 then
    raise exception 'FALLA: la migración duplicó los roles de Fabi';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Eliminar la cuenta borra también los roles
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
select inventariado.crear_negocio('Almacén Hugo', null, null,
  '30000000-0000-0000-0000-0000000000f3', 'Hugo', 'hash-hugo') as negocio_hugo \gset
insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
values ('30000000-0000-0000-0000-0000000000e1', :'negocio_hugo', 'Ines', 'cajero', 'h');
insert into inventariado.roles (negocio_id, nombre, permisos) values (:'negocio_hugo', 'Propio', '["stock"]');
reset role;
select set_config('pruebas.negocio_hugo', :'negocio_hugo', false);
do $$
begin
  if (select count(*) from inventariado.roles where negocio_id = current_setting('pruebas.negocio_hugo')::uuid) <> 4 then
    raise exception 'FALLA: Hugo no tiene sus 4 roles antes de eliminar la cuenta';
  end if;
end;
$$;

-- Fabi no puede eliminar el negocio de Hugo.
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.debe_fallar(
  format($q$select inventariado.eliminar_mi_negocio(%L)$q$, current_setting('pruebas.negocio_hugo')),
  '42501');
reset role;

select pg_temp.como('00000000-0000-0000-0000-0000000000f3');
select inventariado.eliminar_mi_negocio(:'negocio_hugo');
reset role;

do $$
declare
  h uuid := current_setting('pruebas.negocio_hugo')::uuid;
begin
  if exists (select 1 from inventariado.roles where negocio_id = h) then
    raise exception 'FALLA: eliminar_mi_negocio dejó roles';
  end if;
  if exists (select 1 from inventariado.perfiles where negocio_id = h) then
    raise exception 'FALLA: eliminar_mi_negocio dejó perfiles';
  end if;
  if exists (select 1 from inventariado.negocios where id = h) then
    raise exception 'FALLA: eliminar_mi_negocio dejó el negocio';
  end if;
  -- Los roles de otros negocios no se tocan.
  if (select count(*) from inventariado.roles where negocio_id = current_setting('pruebas.negocio_fabi')::uuid) < 3 then
    raise exception 'FALLA: se borraron roles de otro negocio';
  end if;
end;
$$;
