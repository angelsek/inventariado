-- Pruebas de la migración permisos_por_persona: perfiles.permisos (arreglo jsonb), migración
-- de datos desde los roles, valor por defecto para APK viejas, validación, dueño siempre
-- con lista vacía y aislamiento entre negocios.
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

-- Permisos de una persona (para comparar en un solo lugar).
create function pg_temp.permisos_de(p_id uuid) returns jsonb language sql as $$
  select permisos from inventariado.perfiles where id = p_id;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f4', 'ximena@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000f5', 'yago@ejemplo.cl');

select pg_temp.como('00000000-0000-0000-0000-0000000000f4');
select inventariado.crear_negocio('Almacén Ximena', null, null,
  '94000000-0000-0000-0000-0000000000d1', 'Ximena', 'hash-ximena') as negocio_x \gset
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000f5');
select inventariado.crear_negocio('Kiosko Yago', null, null,
  '94000000-0000-0000-0000-0000000000d2', 'Yago', 'hash-yago') as negocio_y \gset
reset role;
select set_config('pruebas.negocio_x', :'negocio_x', false);
select set_config('pruebas.negocio_y', :'negocio_y', false);

-- ---------------------------------------------------------------------------
-- El dueño nace con lista vacía (aunque la columna tenga 7 permisos por defecto)
-- ---------------------------------------------------------------------------

do $$
begin
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000d1') <> '[]'::jsonb
     or pg_temp.permisos_de('94000000-0000-0000-0000-0000000000d2') <> '[]'::jsonb then
    raise exception 'FALLA: el dueño de un negocio nuevo no quedó con permisos []';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Valor por defecto y upsert (APK vieja sin la columna)
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f4');

-- Una APK vieja inserta una persona sin permisos: parte con los 7 iniciales.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
values ('94000000-0000-0000-0000-0000000000a1', :'negocio_x', 'Vieja', 'cajero', 'h');
-- La APK nueva manda los permisos: se respetan, también la lista vacía.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, permisos, pin_hash)
values ('94000000-0000-0000-0000-0000000000a2', :'negocio_x', 'Nueva', 'cajero', '["stock"]', 'h'),
       ('94000000-0000-0000-0000-0000000000a3', :'negocio_x', 'Sin nada', 'cajero', '[]', 'h');
reset role;

do $$
begin
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a1') <>
     '["vender", "ventas_ver", "caja", "fiado", "productos_editar", "mercaderia", "stock"]'::jsonb then
    raise exception 'FALLA: la persona sin permisos no quedó con los 7 iniciales (%)',
      pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a1');
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a2') <> '["stock"]'::jsonb then
    raise exception 'FALLA: no se respetaron los permisos enviados';
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a3') <> '[]'::jsonb then
    raise exception 'FALLA: una lista vacía enviada se reemplazó por el valor por defecto';
  end if;
end;
$$;

-- Un upsert sin la columna permisos (así sube una APK vieja) conserva los permisos.
select pg_temp.como('00000000-0000-0000-0000-0000000000f4');
insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash, activo)
values ('94000000-0000-0000-0000-0000000000a2', :'negocio_x', 'Nueva P.', 'cajero', 'h2', true)
on conflict (id) do update
  set nombre = excluded.nombre, pin_hash = excluded.pin_hash, activo = excluded.activo;
reset role;
do $$
begin
  if (select nombre from inventariado.perfiles where id = '94000000-0000-0000-0000-0000000000a2') <> 'Nueva P.' then
    raise exception 'FALLA: el upsert sin permisos no actualizó el nombre';
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a2') <> '["stock"]'::jsonb then
    raise exception 'FALLA: el upsert sin la columna permisos pisó los permisos (%)',
      pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a2');
  end if;
end;
$$;

-- Un upsert con la columna (APK nueva) sí los cambia.
select pg_temp.como('00000000-0000-0000-0000-0000000000f4');
insert into inventariado.perfiles (id, negocio_id, nombre, rol, permisos, pin_hash, activo)
values ('94000000-0000-0000-0000-0000000000a2', :'negocio_x', 'Nueva P.', 'cajero', '["caja", "reportes"]', 'h2', true)
on conflict (id) do update
  set nombre = excluded.nombre, permisos = excluded.permisos, pin_hash = excluded.pin_hash,
      activo = excluded.activo;
reset role;
do $$
begin
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a2') <> '["caja", "reportes"]'::jsonb then
    raise exception 'FALLA: el upsert con permisos no los cambió';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos inválidos
-- ---------------------------------------------------------------------------

select '[' || string_agg('"p' || i || '"', ',') || ']' as lista50
  from generate_series(1, 50) i \gset
select '[' || string_agg('"p' || i || '"', ',') || ']' as lista51
  from generate_series(1, 51) i \gset

select pg_temp.como('00000000-0000-0000-0000-0000000000f4');
-- Un objeto, un número, un texto, números dentro del arreglo, null y arreglos anidados.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Malo 1', 'cajero', '{"vender": true}', 'h')$q$, :'negocio_x'), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Malo 2', 'cajero', '5', 'h')$q$, :'negocio_x'), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Malo 3', 'cajero', '"vender"', 'h')$q$, :'negocio_x'), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Malo 4', 'cajero', '[1, 2]', 'h')$q$, :'negocio_x'), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Malo 5', 'cajero', '["vender", null]', 'h')$q$, :'negocio_x'), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Malo 6', 'cajero', '[["vender"]]', 'h')$q$, :'negocio_x'), '23514');
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Malo 7', 'cajero', 'null'::jsonb, 'h')$q$, :'negocio_x'), '23514');
-- Un null de SQL tampoco: la columna es obligatoria.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Malo 8', 'cajero', null, 'h')$q$, :'negocio_x'), '23502');
-- Más de 50 permisos.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Malo 9', 'cajero', %L::jsonb, 'h')$q$, :'negocio_x', :'lista51'), '23514');
-- También al actualizar.
select pg_temp.debe_fallar(
  $q$update inventariado.perfiles set permisos = '{"a": 1}'
      where id = '94000000-0000-0000-0000-0000000000a2'$q$, '23514');
select pg_temp.debe_fallar(
  $q$update inventariado.perfiles set permisos = null
      where id = '94000000-0000-0000-0000-0000000000a2'$q$, '23502');
-- Exactamente 50 sí se acepta.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, permisos, pin_hash)
values ('94000000-0000-0000-0000-0000000000a4', :'negocio_x', 'Cincuenta', 'cajero', :'lista50'::jsonb, 'h');
reset role;

do $$
begin
  if jsonb_array_length(pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a4')) <> 50 then
    raise exception 'FALLA: no se guardaron los 50 permisos';
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a2') <> '["caja", "reportes"]'::jsonb then
    raise exception 'FALLA: una actualización inválida cambió los permisos';
  end if;
  if exists (select 1 from inventariado.perfiles where nombre like 'Malo %') then
    raise exception 'FALLA: se guardó una persona con permisos inválidos';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- El dueño siempre queda con lista vacía
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f4');
update inventariado.perfiles set permisos = '["vender", "usuarios"]'
 where id = '94000000-0000-0000-0000-0000000000d1';
reset role;
do $$
begin
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000d1') <> '[]'::jsonb then
    raise exception 'FALLA: se le dieron permisos al dueño con un update';
  end if;
end;
$$;

-- El upsert del propio dueño (así sincroniza la app) con permisos tampoco los guarda.
select pg_temp.como('00000000-0000-0000-0000-0000000000f4');
insert into inventariado.perfiles (id, negocio_id, nombre, rol, permisos, pin_hash, activo)
values ('94000000-0000-0000-0000-0000000000d1', :'negocio_x', 'Ximena P.', 'dueno', '["caja"]', 'hash-ximena', true)
on conflict (id) do update
  set nombre = excluded.nombre, permisos = excluded.permisos, pin_hash = excluded.pin_hash;
-- Ni con un valor inválido: el dueño no usa la lista.
update inventariado.perfiles set permisos = '{"a": 1}'
 where id = '94000000-0000-0000-0000-0000000000d1';
reset role;
do $$
begin
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000d1') <> '[]'::jsonb then
    raise exception 'FALLA: el upsert del dueño le dejó permisos (%)',
      pg_temp.permisos_de('94000000-0000-0000-0000-0000000000d1');
  end if;
  if (select nombre from inventariado.perfiles where id = '94000000-0000-0000-0000-0000000000d1') <> 'Ximena P.' then
    raise exception 'FALLA: el upsert del dueño no actualizó el nombre';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Migración de datos: cada persona hereda los permisos de su rol
-- ---------------------------------------------------------------------------

-- Estado de la base antes de esta migración: personas con rol_id y sin permisos.
select id as rol_admin_x from inventariado.roles
 where negocio_id = :'negocio_x' and predefinido = 'administrador' \gset
select id as rol_bodeguero_x from inventariado.roles
 where negocio_id = :'negocio_x' and predefinido = 'bodeguero' \gset
select id as rol_cajero_x from inventariado.roles
 where negocio_id = :'negocio_x' and predefinido = 'cajero' \gset

-- El Cajero de Ximena es distinto al de Yago (para probar que se usa el del negocio).
update inventariado.roles set permisos = '["vender", "reportes"]' where id = :'rol_cajero_x';

select pg_temp.como('00000000-0000-0000-0000-0000000000f4');
insert into inventariado.perfiles (id, negocio_id, nombre, rol, rol_id, pin_hash) values
  ('94000000-0000-0000-0000-0000000000b1', :'negocio_x', 'Admin', 'cajero', :'rol_admin_x', 'h'),
  ('94000000-0000-0000-0000-0000000000b2', :'negocio_x', 'Bodeguero', 'cajero', :'rol_bodeguero_x', 'h'),
  ('94000000-0000-0000-0000-0000000000b3', :'negocio_x', 'Sin rol', 'cajero', null, 'h'),
  ('94000000-0000-0000-0000-0000000000b4', :'negocio_x', 'Rol eliminado', 'cajero', null, 'h'),
  ('94000000-0000-0000-0000-0000000000b5', :'negocio_x', 'Ya tenía', 'cajero', :'rol_bodeguero_x', 'h');
insert into inventariado.roles (id, negocio_id, nombre, permisos)
values ('94000000-0000-0000-0000-0000000000c1', :'negocio_x', 'Temporal', '["usuarios", "stock"]');
update inventariado.perfiles set rol_id = '94000000-0000-0000-0000-0000000000c1'
 where id = '94000000-0000-0000-0000-0000000000b4';
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000f5');
insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
values ('94000000-0000-0000-0000-0000000000b6', :'negocio_y', 'Sin rol de Yago', 'cajero', 'h');
reset role;

-- Se simula la base previa: sin triggers (para dejar rol_id vacío o un rol eliminado) y con la
-- columna permisos aún sin valor en las personas que la migración debe completar.
set session_replication_role = replica;
update inventariado.perfiles set rol_id = null
 where id in ('94000000-0000-0000-0000-0000000000b3', '94000000-0000-0000-0000-0000000000b6');
update inventariado.roles set eliminado = true where id = '94000000-0000-0000-0000-0000000000c1';
alter table inventariado.perfiles alter column permisos drop not null;
update inventariado.perfiles set permisos = null
 where id in ('94000000-0000-0000-0000-0000000000b1', '94000000-0000-0000-0000-0000000000b2',
              '94000000-0000-0000-0000-0000000000b3', '94000000-0000-0000-0000-0000000000b4',
              '94000000-0000-0000-0000-0000000000b6',
              '94000000-0000-0000-0000-0000000000d1', '94000000-0000-0000-0000-0000000000d2');
-- "Ya tenía" conserva un permiso personalizado.
update inventariado.perfiles set permisos = '["fiado"]'
 where id = '94000000-0000-0000-0000-0000000000b5';
set session_replication_role = origin;

\ir ../migrations/20261021000100_permisos_por_persona.sql

do $$
declare
  cajero_y jsonb := (select permisos from inventariado.roles
                      where negocio_id = current_setting('pruebas.negocio_y')::uuid and predefinido = 'cajero');
begin
  if jsonb_array_length(pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b1')) <> 15 then
    raise exception 'FALLA: el Administrador no pasó a las personas con 15 permisos (%)',
      pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b1');
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b2') <>
     '["productos_editar", "mercaderia", "stock"]'::jsonb then
    raise exception 'FALLA: el Bodeguero no pasó a la persona con 3 permisos (%)',
      pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b2');
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b3') <> '["vender", "reportes"]'::jsonb then
    raise exception 'FALLA: la persona sin rol no heredó el Cajero de su negocio (%)',
      pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b3');
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b4') <> '["vender", "reportes"]'::jsonb then
    raise exception 'FALLA: la persona con rol eliminado no heredó el Cajero de su negocio (%)',
      pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b4');
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b6') <> cajero_y then
    raise exception 'FALLA: la persona de otro negocio no heredó el Cajero de su propio negocio (%)',
      pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b6');
  end if;
  if cajero_y = '["vender", "reportes"]'::jsonb then
    raise exception 'FALLA: la prueba no distingue el Cajero de cada negocio';
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000d1') <> '[]'::jsonb
     or pg_temp.permisos_de('94000000-0000-0000-0000-0000000000d2') <> '[]'::jsonb then
    raise exception 'FALLA: el dueño no quedó con permisos []';
  end if;
  -- Lo que ya tenía permisos no se toca.
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b5') <> '["fiado"]'::jsonb then
    raise exception 'FALLA: la migración pisó permisos existentes';
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a2') <> '["caja", "reportes"]'::jsonb
     or pg_temp.permisos_de('94000000-0000-0000-0000-0000000000a4') is null then
    raise exception 'FALLA: la migración pisó permisos de otras personas';
  end if;
  -- La columna vuelve a ser obligatoria y con valor por defecto.
  if (select is_nullable from information_schema.columns
       where table_schema = 'inventariado' and table_name = 'perfiles' and column_name = 'permisos') <> 'NO' then
    raise exception 'FALLA: permisos no quedó NOT NULL';
  end if;
  if (select column_default from information_schema.columns
       where table_schema = 'inventariado' and table_name = 'perfiles' and column_name = 'permisos')
     not like '%productos_editar%' then
    raise exception 'FALLA: permisos perdió su valor por defecto';
  end if;
end;
$$;

-- Reejecutar la migración (en Supabase se corre a mano) no pisa permisos personalizados.
update inventariado.perfiles set permisos = '["stock"]'
 where id = '94000000-0000-0000-0000-0000000000b1';
update inventariado.perfiles set permisos = '[]'
 where id = '94000000-0000-0000-0000-0000000000b3';

\ir ../migrations/20261021000100_permisos_por_persona.sql

do $$
begin
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b1') <> '["stock"]'::jsonb then
    raise exception 'FALLA: reejecutar la migración pisó los permisos del Administrador editado';
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b3') <> '[]'::jsonb then
    raise exception 'FALLA: reejecutar la migración pisó una lista vacía';
  end if;
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b2') <>
     '["productos_editar", "mercaderia", "stock"]'::jsonb then
    raise exception 'FALLA: reejecutar la migración cambió los permisos del Bodeguero';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- La descarga entrega permisos como arreglo
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f4');
do $$
declare
  d jsonb := inventariado.sincronizar_descarga('perfiles', current_setting('pruebas.negocio_x')::uuid, null);
  fila jsonb;
begin
  if jsonb_array_length(d->'filas') < 10 then
    raise exception 'FALLA: sincronizar_descarga(perfiles) devolvió % filas', jsonb_array_length(d->'filas');
  end if;
  for fila in select * from jsonb_array_elements(d->'filas') loop
    if jsonb_typeof(fila->'permisos') <> 'array' then
      raise exception 'FALLA: permisos no viene como arreglo en %', fila->>'nombre';
    end if;
    if fila ? 'sync_xid' then
      raise exception 'FALLA: la descarga expone sync_xid';
    end if;
  end loop;
  if (select f->'permisos' from jsonb_array_elements(d->'filas') f
       where f->>'id' = '94000000-0000-0000-0000-0000000000d1') <> '[]'::jsonb then
    raise exception 'FALLA: el dueño no viene con permisos []';
  end if;
  if (select f->'permisos' from jsonb_array_elements(d->'filas') f
       where f->>'id' = '94000000-0000-0000-0000-0000000000b2') <> '["productos_editar", "mercaderia", "stock"]'::jsonb then
    raise exception 'FALLA: la descarga no trae los permisos del Bodeguero';
  end if;
  if exists (select 1 from jsonb_array_elements(d->'filas') f
              where f->>'negocio_id' <> current_setting('pruebas.negocio_x')) then
    raise exception 'FALLA: la descarga trae personas de otro negocio';
  end if;
end;
$$;
reset role;

-- ---------------------------------------------------------------------------
-- RLS: otro negocio no ve ni toca los permisos
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000f5');
do $$
declare
  n integer;
  d jsonb := inventariado.sincronizar_descarga('perfiles', current_setting('pruebas.negocio_x')::uuid, null);
begin
  if jsonb_array_length(d->'filas') <> 0 then
    raise exception 'FALLA: Yago descarga a las personas de Ximena (% filas)', jsonb_array_length(d->'filas');
  end if;
  if exists (select 1 from inventariado.perfiles where negocio_id = current_setting('pruebas.negocio_x')::uuid) then
    raise exception 'FALLA: Yago ve perfiles de Ximena';
  end if;
  -- Cambiar los permisos de una persona de Ximena no afecta ninguna fila.
  with cambiados as (
    update inventariado.perfiles set permisos = '["usuarios"]'
     where negocio_id = current_setting('pruebas.negocio_x')::uuid returning 1
  )
  select count(*) into n from cambiados;
  if n <> 0 then
    raise exception 'FALLA: Yago modificó % perfiles de Ximena', n;
  end if;
end;
$$;
-- Ni agregar una persona al negocio de Ximena.
select pg_temp.debe_fallar(
  format($q$insert into inventariado.perfiles (negocio_id, nombre, rol, permisos, pin_hash)
            values (%L, 'Intruso', 'cajero', '["usuarios"]', 'h')$q$, :'negocio_x'), '42501');
reset role;

-- Sin sesión no se lee nada.
select pg_temp.como(null);
select pg_temp.debe_fallar('select permisos from inventariado.perfiles', '42501');
reset role;

do $$
begin
  if pg_temp.permisos_de('94000000-0000-0000-0000-0000000000b2') <>
     '["productos_editar", "mercaderia", "stock"]'::jsonb then
    raise exception 'FALLA: un intruso cambió los permisos de otro negocio';
  end if;
  if exists (select 1 from inventariado.perfiles where nombre = 'Intruso') then
    raise exception 'FALLA: se agregó una persona a otro negocio';
  end if;
end;
$$;

select 'Todas las pruebas SQL de permisos por persona pasaron';
