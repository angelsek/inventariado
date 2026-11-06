-- Pruebas de varios locales por cuenta y de personas en más de un local
-- (migración 20261106000100). Los ids se pasan con set_config()/current_setting(): psql no
-- reemplaza variables dentro de los bloques do $$ ... $$.
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

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'dueno.multi@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000d2', 'otro.dueno@ejemplo.cl');

-- ---------------------------------------------------------------------------
-- Una cuenta crea varios locales
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000d1');

select set_config('t.local1', inventariado.crear_negocio(
  'Local Centro', '11.111.111-1', 'Calle 1', gen_random_uuid(), 'Rosa', 'hash-rosa')::text, false);
-- Sin pagar el primero, el segundo local nace sin prueba.
select set_config('t.local2', inventariado.crear_negocio(
  'Local Norte', null, 'Calle 2', gen_random_uuid(), 'Rosa', 'hash-rosa')::text, false);

reset role;

do $$
begin
  if (select count(*) from inventariado.negocio_usuarios
       where usuario_id = '00000000-0000-0000-0000-0000000000d1') <> 2 then
    raise exception 'FALLA: la cuenta debería tener 2 locales';
  end if;
  if (select prueba_hasta from inventariado.suscripciones
       where negocio_id = current_setting('t.local2')::uuid) is not null then
    raise exception 'FALLA: el 2.º local no debería tener prueba si el 1.º no está pagado';
  end if;
end;
$$;

-- Con un local pagado pero otro sin pagar, el tercero tampoco recibe prueba (no se encadenan).
update inventariado.suscripciones
   set pagado_hasta = now() + interval '30 days'
 where negocio_id = current_setting('t.local1')::uuid;
select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select set_config('t.local_sin', inventariado.crear_negocio(
  'Local Sin', null, 'Calle 0', gen_random_uuid(), 'Rosa', 'hash-rosa')::text, false);
reset role;
do $$
begin
  if (select prueba_hasta from inventariado.suscripciones
       where negocio_id = current_setting('t.local_sin')::uuid) is not null then
    raise exception 'FALLA: no debería haber prueba mientras otro local está sin pagar';
  end if;
end;
$$;

-- Con todos los locales pagados, el siguiente recibe 7 días.
update inventariado.suscripciones set pagado_hasta = now() + interval '30 days'
 where negocio_id in (current_setting('t.local2')::uuid, current_setting('t.local_sin')::uuid);

select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select set_config('t.local3', inventariado.crear_negocio(
  'Local Sur', null, 'Calle 3', gen_random_uuid(), 'Rosa', 'hash-rosa')::text, false);
reset role;

do $$
declare
  v timestamptz;
begin
  select prueba_hasta into v from inventariado.suscripciones
   where negocio_id = current_setting('t.local3')::uuid;
  if v is null or v < now() + interval '6 days' or v > now() + interval '8 days' then
    raise exception 'FALLA: el 3.er local debería tener 7 días de prueba (tiene %)', v;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- mis_negocios(): solo los de la sesión
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select set_config('t.lista', inventariado.mis_negocios()::text, false);
select pg_temp.como('00000000-0000-0000-0000-0000000000d2');
select set_config('t.lista_otro', inventariado.mis_negocios()::text, false);
reset role;

do $$
begin
  if jsonb_array_length(current_setting('t.lista')::jsonb) <> 4 then
    raise exception 'FALLA: mis_negocios debería listar 4 locales: %', current_setting('t.lista');
  end if;
  if jsonb_array_length(current_setting('t.lista_otro')::jsonb) <> 0 then
    raise exception 'FALLA: otra cuenta no debería ver locales ajenos';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Persona en más de un local
-- ---------------------------------------------------------------------------

select set_config('t.perfil_a', gen_random_uuid()::text, false);
select set_config('t.perfil_b', gen_random_uuid()::text, false);

-- Su perfil en el local 1 (lo crea la app y lo sube la sincronización), todavía sin persona_id.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash, permisos)
values (current_setting('t.perfil_a')::uuid, current_setting('t.local1')::uuid, 'Juan',
        'cajero', 'hash-a', '["vender", "multi_local"]'::jsonb);

select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select inventariado.asignar_persona_a_local(
  current_setting('t.perfil_b')::uuid, current_setting('t.local2')::uuid, 'Juan', 'hash-b',
  current_setting('t.perfil_a')::uuid, '["vender"]'::jsonb);
reset role;

-- El servidor armó la unión: el perfil de origen y el nuevo comparten persona_id.
select set_config('t.persona',
  (select persona_id::text from inventariado.perfiles
    where id = current_setting('t.perfil_a')::uuid), false);

select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select set_config('t.lista_persona',
  inventariado.mis_locales_como_persona(current_setting('t.persona')::uuid)::text, false);
reset role;

do $$
begin
  if current_setting('t.persona') = '' then
    raise exception 'FALLA: el perfil de origen debería quedar con persona_id';
  end if;
  -- El permiso multi_local se agrega solo en el destino.
  if not exists (select 1 from inventariado.perfiles
                  where id = current_setting('t.perfil_b')::uuid and permisos ? 'multi_local'
                    and persona_id = current_setting('t.persona')::uuid and rol = 'cajero') then
    raise exception 'FALLA: el perfil asignado debería tener multi_local y la misma persona';
  end if;
  if jsonb_array_length(current_setting('t.lista_persona')::jsonb) <> 2 then
    raise exception 'FALLA: la persona debería ver 2 locales: %', current_setting('t.lista_persona');
  end if;
end;
$$;

-- Un negocio ajeno no se puede usar de destino.
select pg_temp.como('00000000-0000-0000-0000-0000000000d2');
do $$
begin
  begin
    perform inventariado.asignar_persona_a_local(
      gen_random_uuid(), current_setting('t.local1')::uuid, 'Intruso', 'hash',
      current_setting('t.perfil_a')::uuid, '[]'::jsonb);
    raise exception 'FALLA: se pudo asignar a un local ajeno';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

-- Ni repetir el id de un perfil existente, ni asignar dos veces a la misma persona al mismo local.
select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
do $$
begin
  begin
    perform inventariado.asignar_persona_a_local(
      current_setting('t.perfil_a')::uuid, current_setting('t.local3')::uuid, 'Juan', 'hash',
      current_setting('t.perfil_a')::uuid, '[]'::jsonb);
    raise exception 'FALLA: se reutilizó el id de un perfil de otro local';
  exception when unique_violation then
    null;
  end;
  begin
    perform inventariado.asignar_persona_a_local(
      gen_random_uuid(), current_setting('t.local2')::uuid, 'Juan', 'hash',
      current_setting('t.perfil_a')::uuid, '[]'::jsonb);
    raise exception 'FALLA: se asignó dos veces la persona al mismo local';
  exception when unique_violation then
    null;
  end;
  -- Tampoco al local donde ya está.
  begin
    perform inventariado.asignar_persona_a_local(
      gen_random_uuid(), current_setting('t.local1')::uuid, 'Juan', 'hash',
      current_setting('t.perfil_a')::uuid, '[]'::jsonb);
    raise exception 'FALLA: se asignó la persona a su propio local';
  exception when unique_violation then
    null;
  end;
  -- Una persona que no existe, o el perfil del dueño, no sirven de origen.
  begin
    perform inventariado.asignar_persona_a_local(
      gen_random_uuid(), current_setting('t.local3')::uuid, 'Fantasma', 'hash',
      gen_random_uuid(), '[]'::jsonb);
    raise exception 'FALLA: se asignó una persona inexistente';
  exception when sqlstate 'P0002' then
    null;
  end;
  begin
    perform inventariado.asignar_persona_a_local(
      gen_random_uuid(), current_setting('t.local3')::uuid, 'Dueño', 'hash',
      (select id from inventariado.perfiles
        where negocio_id = current_setting('t.local1')::uuid and rol = 'dueno'),
      '[]'::jsonb);
    raise exception 'FALLA: se asignó al dueño a otro local';
  exception when sqlstate 'P0002' then
    null;
  end;
  -- Datos inválidos.
  begin
    perform inventariado.asignar_persona_a_local(
      gen_random_uuid(), current_setting('t.local3')::uuid, '   ', 'hash',
      current_setting('t.perfil_a')::uuid, '[]'::jsonb);
    raise exception 'FALLA: se aceptó un nombre vacío';
  exception when sqlstate '22023' then
    null;
  end;
end;
$$;

-- Sin multi_local, un perfil desactivado o eliminado deja de aparecer; una persona desconocida no ve nada.
reset role;
update inventariado.perfiles set permisos = '["vender"]'::jsonb
 where id = current_setting('t.perfil_a')::uuid;
select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select set_config('t.lista_sin_permiso',
  inventariado.mis_locales_como_persona(current_setting('t.persona')::uuid)::text, false);
reset role;
update inventariado.perfiles set permisos = '["vender", "multi_local"]'::jsonb
 where id = current_setting('t.perfil_a')::uuid;
update inventariado.perfiles set activo = false where id = current_setting('t.perfil_b')::uuid;
select pg_temp.como('00000000-0000-0000-0000-0000000000d1');
select set_config('t.lista_persona',
  inventariado.mis_locales_como_persona(current_setting('t.persona')::uuid)::text, false);
select set_config('t.lista_desconocida',
  inventariado.mis_locales_como_persona(gen_random_uuid())::text, false);
reset role;

do $$
begin
  if jsonb_array_length(current_setting('t.lista_sin_permiso')::jsonb) <> 1 then
    raise exception 'FALLA: un perfil sin multi_local no debería listarse: %',
      current_setting('t.lista_sin_permiso');
  end if;
  if jsonb_array_length(current_setting('t.lista_persona')::jsonb) <> 1 then
    raise exception 'FALLA: un perfil desactivado no debería listarse: %',
      current_setting('t.lista_persona');
  end if;
  if jsonb_array_length(current_setting('t.lista_desconocida')::jsonb) <> 0 then
    raise exception 'FALLA: una persona desconocida no debería ver locales';
  end if;
end;
$$;

-- persona_id no cambia una vez puesto, ni siquiera si un equipo viejo sube la fila sin él.
update inventariado.perfiles set persona_id = null where id = current_setting('t.perfil_a')::uuid;
update inventariado.perfiles set persona_id = gen_random_uuid()
 where id = current_setting('t.perfil_a')::uuid;
-- Un upsert de un equipo viejo (sin la columna) tampoco la borra.
insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
values (current_setting('t.perfil_a')::uuid, current_setting('t.local1')::uuid, 'Juan P.',
        'cajero', 'hash-a')
on conflict (id) do update set nombre = excluded.nombre;

do $$
begin
  if (select persona_id from inventariado.perfiles where id = current_setting('t.perfil_a')::uuid)
     is distinct from current_setting('t.persona')::uuid then
    raise exception 'FALLA: persona_id no debería cambiar una vez puesto';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- La RLS sigue aislando: otra cuenta no ve perfiles de estos locales
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000d2');
do $$
begin
  if exists (select 1 from inventariado.perfiles
              where negocio_id = current_setting('t.local1')::uuid) then
    raise exception 'FALLA: otra cuenta ve perfiles de un local ajeno';
  end if;
end;
$$;
reset role;

\o
select 'OK: pruebas de multi local' as resultado;
