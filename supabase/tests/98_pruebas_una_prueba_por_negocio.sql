-- Pruebas de "una sola prueba gratis por negocio" (migración 20261023000100).
-- Ojo: psql no reemplaza las variables :'x' dentro de los bloques do $$ ... $$, así que los
-- ids se pasan con set_config()/current_setting(), igual que en las otras pruebas.
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

-- Hasta cuándo dura la prueba de un negocio (null = nació sin prueba).
create function pg_temp.prueba_hasta(p_negocio text) returns timestamptz language sql as $$
  select prueba_hasta from inventariado.suscripciones
   where negocio_id = current_setting(p_negocio)::uuid;
$$;

create function pg_temp.estado(p_negocio text) returns text language sql as $$
  select inventariado.estado_suscripcion(s) from inventariado.suscripciones s
   where s.negocio_id = current_setting(p_negocio)::uuid;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'rosa@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000c2', 'rosa.otro@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000c3', 'rosa@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000c4', 'tercero@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000c5', 'ana@gmail.com'),
  ('00000000-0000-0000-0000-0000000000c6', 'A.N.A+local2@googlemail.com'),
  ('00000000-0000-0000-0000-0000000000c7', 'vieja@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000c8', 'luz@ejemplo.cl'),
  ('00000000-0000-0000-0000-0000000000c9', 'admin-pruebas@ejemplo.cl');

-- ---------------------------------------------------------------------------
-- Normalización y huella
-- ---------------------------------------------------------------------------

do $$
begin
  if inventariado.normalizar_correo(' Ana+Compras@GoogleMail.com ') <> 'ana@gmail.com' then
    raise exception 'FALLA: el correo de Gmail no se normaliza: %',
      inventariado.normalizar_correo(' Ana+Compras@GoogleMail.com ');
  end if;
  -- Fuera de Gmail los puntos sí cuentan; la etiqueta "+algo" se saca igual.
  if inventariado.normalizar_correo('a.b+x@ejemplo.cl') <> 'a.b@ejemplo.cl' then
    raise exception 'FALLA: el correo común no se normaliza bien';
  end if;
  if inventariado.normalizar_correo(null) is not null
     or inventariado.normalizar_correo('   ') is not null then
    raise exception 'FALLA: un correo vacío debería quedar en null';
  end if;
  if inventariado.normalizar_rut('12.345.678-5') <> '123456785'
     or inventariado.normalizar_rut('12345678-k') <> '12345678K' then
    raise exception 'FALLA: el RUT no se normaliza';
  end if;
  if inventariado.normalizar_rut('hola') is not null
     or inventariado.normalizar_rut('') is not null then
    raise exception 'FALLA: un RUT sin forma de RUT debería quedar en null';
  end if;
  -- La huella no deja ver el dato y distingue el tipo de llave.
  if inventariado.huella_prueba('rut', '123456785') = '123456785'
     or inventariado.huella_prueba('rut', '123456785')
        = inventariado.huella_prueba('equipo', '123456785') then
    raise exception 'FALLA: la huella no sirve como huella';
  end if;
  if inventariado.huella_prueba('rut', null) is not null then
    raise exception 'FALLA: una llave vacía no debería tener huella';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Negocio nuevo: 7 días de prueba, plan Pro, con sus tres llaves anotadas
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select inventariado.crear_negocio(
  'Almacén Rosa', '12.345.678-5', null, gen_random_uuid(), 'Rosa', 'x',
  '00000000-0000-0000-0000-0000000000e1'::uuid) as negocio_rosa \gset
select set_config('pruebas.rosa', :'negocio_rosa', false);
-- La app vincula el equipo justo después, con el mismo id.
select inventariado.registrar_dispositivo(
  '00000000-0000-0000-0000-0000000000e1'::uuid, :'negocio_rosa'::uuid, 'Teléfono de Rosa');
reset role;

do $$
declare
  v_hasta timestamptz := pg_temp.prueba_hasta('pruebas.rosa');
begin
  if pg_temp.estado('pruebas.rosa') <> 'prueba' then
    raise exception 'FALLA: el negocio nuevo no quedó en prueba: %', pg_temp.estado('pruebas.rosa');
  end if;
  if v_hasta < now() + interval '6 days 23 hours' or v_hasta > now() + interval '7 days 1 minute' then
    raise exception 'FALLA: la prueba no dura 7 días: %', v_hasta;
  end if;
  if (select plan_id from inventariado.suscripciones
       where negocio_id = current_setting('pruebas.rosa')::uuid) <> 'pro' then
    raise exception 'FALLA: la prueba debería ser del plan Pro';
  end if;
  -- Quedaron anotadas las tres llaves: correo, RUT y equipo.
  if (select count(*) from inventariado.llaves_del_negocio(current_setting('pruebas.rosa')::uuid) k
       join inventariado.pruebas_usadas u on u.llave_hash = k.llave_hash) <> 3 then
    raise exception 'FALLA: no se anotaron las tres llaves';
  end if;
  perform set_config('pruebas.rosa_hasta', v_hasta::text, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. El mismo equipo con otro correo y sin RUT: hereda la fecha, no 7 días nuevos
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000c2');
select inventariado.crear_negocio(
  'Almacén Rosa 2', null, null, gen_random_uuid(), 'Rosa', 'x',
  '00000000-0000-0000-0000-0000000000e1'::uuid) as negocio_equipo \gset
select set_config('pruebas.equipo', :'negocio_equipo', false);
reset role;

do $$
begin
  if pg_temp.prueba_hasta('pruebas.equipo') <> current_setting('pruebas.rosa_hasta')::timestamptz then
    raise exception 'FALLA: el mismo equipo recibió una prueba nueva (% en vez de %)',
      pg_temp.prueba_hasta('pruebas.equipo'), current_setting('pruebas.rosa_hasta');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. El mismo correo desde otro equipo: hereda la fecha
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000c3');
select inventariado.crear_negocio(
  'Almacén Rosa 3', null, null, gen_random_uuid(), 'Rosa', 'x',
  '00000000-0000-0000-0000-0000000000e2'::uuid) as negocio_correo \gset
select set_config('pruebas.correo', :'negocio_correo', false);
reset role;

do $$
begin
  if pg_temp.prueba_hasta('pruebas.correo') <> current_setting('pruebas.rosa_hasta')::timestamptz then
    raise exception 'FALLA: el mismo correo recibió una prueba nueva';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. El mismo RUT escrito distinto, con correo y equipo nuevos: hereda la fecha
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000c4');
select inventariado.crear_negocio(
  'Almacén Tercero', '123456785', null, gen_random_uuid(), 'Tercero', 'x',
  '00000000-0000-0000-0000-0000000000e3'::uuid) as negocio_rut \gset
select set_config('pruebas.rut', :'negocio_rut', false);
reset role;

do $$
begin
  if pg_temp.prueba_hasta('pruebas.rut') <> current_setting('pruebas.rosa_hasta')::timestamptz then
    raise exception 'FALLA: el mismo RUT escrito distinto recibió una prueba nueva';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Los alias de Gmail son el mismo correo
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000c5');
select inventariado.crear_negocio(
  'Bazar Ana', null, null, gen_random_uuid(), 'Ana', 'x',
  '00000000-0000-0000-0000-0000000000e4'::uuid) as negocio_ana \gset
select set_config('pruebas.ana', :'negocio_ana', false);
reset role;
select pg_temp.como('00000000-0000-0000-0000-0000000000c6');
select inventariado.crear_negocio(
  'Bazar Ana 2', null, null, gen_random_uuid(), 'Ana', 'x',
  '00000000-0000-0000-0000-0000000000e5'::uuid) as negocio_ana2 \gset
select set_config('pruebas.ana2', :'negocio_ana2', false);
reset role;

do $$
begin
  if pg_temp.prueba_hasta('pruebas.ana') is null then
    raise exception 'FALLA: el primer negocio de Ana debería tener prueba';
  end if;
  if pg_temp.prueba_hasta('pruebas.ana2') <> pg_temp.prueba_hasta('pruebas.ana') then
    raise exception 'FALLA: A.N.A+local2@googlemail.com debería ser el mismo correo que ana@gmail.com';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Borrar el negocio y rehacerlo el mismo día: quedan los días que faltaban
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select inventariado.eliminar_mi_negocio(current_setting('pruebas.rosa')::uuid);
reset role;

-- El registro de la prueba sobrevive a eliminar el negocio: es justo lo que cierra el ciclo.
do $$
begin
  if not exists (select 1 from inventariado.pruebas_usadas
                  where llave_hash = inventariado.huella_prueba('rut', '123456785')) then
    raise exception 'FALLA: eliminar el negocio borró el registro de la prueba usada';
  end if;
end;
$$;

select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select inventariado.crear_negocio(
  'Almacén Rosa otra vez', '12.345.678-5', null, gen_random_uuid(), 'Rosa', 'x',
  '00000000-0000-0000-0000-0000000000e1'::uuid) as negocio_rosa_b \gset
select set_config('pruebas.rosa_b', :'negocio_rosa_b', false);
reset role;

do $$
declare
  v_hasta timestamptz := pg_temp.prueba_hasta('pruebas.rosa_b');
begin
  if v_hasta is null then
    raise exception 'FALLA: rehacer la cuenta el mismo día debería dejar los días que faltaban';
  end if;
  if v_hasta <> current_setting('pruebas.rosa_hasta')::timestamptz then
    raise exception 'FALLA: la prueba nueva no mantiene la fecha original: % vs %',
      v_hasta, current_setting('pruebas.rosa_hasta');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Una prueba que ya venció no revive, y el admin la ve bloqueada
-- ---------------------------------------------------------------------------

insert into inventariado.pruebas_usadas (llave_hash, tipo, prueba_hasta)
values (inventariado.huella_prueba('correo', 'vieja@ejemplo.cl'), 'correo', now() - interval '30 days')
on conflict (llave_hash) do update set prueba_hasta = excluded.prueba_hasta;

select pg_temp.como('00000000-0000-0000-0000-0000000000c7');
select inventariado.crear_negocio(
  'Almacén Viejo', null, null, gen_random_uuid(), 'Pedro', 'x',
  '00000000-0000-0000-0000-0000000000e6'::uuid) as negocio_viejo \gset
select set_config('pruebas.viejo', :'negocio_viejo', false);
reset role;

do $$
begin
  if pg_temp.prueba_hasta('pruebas.viejo') is not null then
    raise exception 'FALLA: una prueba vencida no debería dar días nuevos';
  end if;
  -- Sin prueba, la app lo trata como suspendido (solo lectura) y muestra la explicación.
  if pg_temp.estado('pruebas.viejo') <> 'suspendida' then
    raise exception 'FALLA: sin prueba el negocio debería quedar suspendido: %',
      pg_temp.estado('pruebas.viejo');
  end if;
  if not inventariado.prueba_bloqueada(current_setting('pruebas.viejo')::uuid) then
    raise exception 'FALLA: el negocio debería verse como prueba bloqueada en administración';
  end if;
  -- Un negocio en prueba normal no sale marcado.
  if inventariado.prueba_bloqueada(current_setting('pruebas.ana')::uuid) then
    raise exception 'FALLA: un negocio con prueba no debería salir bloqueado';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. La salida del admin: liberar la prueba
-- ---------------------------------------------------------------------------

-- Sin ser administrador no se puede.
select pg_temp.como('00000000-0000-0000-0000-0000000000c7');
do $$
begin
  begin
    perform inventariado.admin_liberar_prueba(current_setting('pruebas.viejo')::uuid);
    raise exception 'FALLA: un usuario cualquiera pudo liberar la prueba';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

insert into inventariado.administradores (usuario_id)
values ('00000000-0000-0000-0000-0000000000c9')
on conflict (usuario_id) do nothing;

-- En la lista del panel se ve por qué el negocio nació suspendido.
select pg_temp.como('00000000-0000-0000-0000-0000000000c9');
do $$
declare
  v_fila jsonb;
begin
  select f into v_fila
    from jsonb_array_elements(inventariado.admin_listar_negocios()) f
   where f->>'id' = current_setting('pruebas.viejo');
  if v_fila is null then
    raise exception 'FALLA: el negocio no aparece en la lista de administración';
  end if;
  if (v_fila->>'prueba_bloqueada')::boolean is not true then
    raise exception 'FALLA: admin_listar_negocios no marca la prueba bloqueada: %', v_fila;
  end if;
end;
$$;

select inventariado.admin_liberar_prueba(current_setting('pruebas.viejo')::uuid, 7);
reset role;

do $$
declare
  v_hasta timestamptz := pg_temp.prueba_hasta('pruebas.viejo');
begin
  if v_hasta is null or v_hasta < now() + interval '6 days 23 hours' then
    raise exception 'FALLA: liberar la prueba no dio los 7 días: %', v_hasta;
  end if;
  if pg_temp.estado('pruebas.viejo') <> 'prueba' then
    raise exception 'FALLA: después de liberar, el negocio debería estar en prueba';
  end if;
  if inventariado.prueba_bloqueada(current_setting('pruebas.viejo')::uuid) then
    raise exception 'FALLA: el negocio liberado sigue marcado como bloqueado';
  end if;
  -- Las llaves quedan anotadas con la fecha nueva: sigue siendo una sola prueba.
  if (select prueba_hasta from inventariado.pruebas_usadas
       where llave_hash = inventariado.huella_prueba('correo', 'vieja@ejemplo.cl')) <> v_hasta then
    raise exception 'FALLA: liberar la prueba no actualizó la llave del correo';
  end if;
end;
$$;

-- Días fuera de rango.
select pg_temp.como('00000000-0000-0000-0000-0000000000c9');
do $$
begin
  begin
    perform inventariado.admin_liberar_prueba(current_setting('pruebas.viejo')::uuid, 0);
    raise exception 'FALLA: se aceptaron 0 días de prueba';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. Compatibilidad: los APK viejos llaman sin el id del equipo
-- ---------------------------------------------------------------------------

select pg_temp.como('00000000-0000-0000-0000-0000000000c8');
select inventariado.crear_negocio(
  'Almacén Sin Equipo', null, null, gen_random_uuid(), 'Luz', 'x') as negocio_sin_equipo \gset
select set_config('pruebas.sin_equipo', :'negocio_sin_equipo', false);
reset role;

do $$
begin
  if pg_temp.prueba_hasta('pruebas.sin_equipo') is null then
    raise exception 'FALLA: la llamada de 6 argumentos debería seguir dando la prueba';
  end if;
  -- Sin equipo vinculado y sin RUT, la única llave es el correo.
  if (select count(*) from inventariado.llaves_del_negocio(
        current_setting('pruebas.sin_equipo')::uuid)) <> 1 then
    raise exception 'FALLA: se esperaba una sola llave (el correo)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Permisos
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'inventariado.consumir_prueba(text, text, uuid)',
    'inventariado.llaves_de_prueba(text, text, uuid)',
    'inventariado.llaves_del_negocio(uuid)',
    'inventariado.huella_prueba(text, text)',
    'inventariado.normalizar_correo(text)',
    'inventariado.normalizar_rut(text)',
    'inventariado.prueba_bloqueada(uuid)',
    'inventariado.crear_suscripcion_de_prueba()'
  ] loop
    if has_function_privilege('authenticated', f, 'execute')
       or has_function_privilege('anon', f, 'execute') then
      raise exception 'FALLA: % quedó ejecutable para los usuarios de la app', f;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'inventariado.pruebas_usadas', 'select')
     or has_table_privilege('anon', 'inventariado.pruebas_usadas', 'select') then
    raise exception 'FALLA: pruebas_usadas se puede leer desde la app';
  end if;

  -- La tabla no se sincroniza (no tiene sync_xid).
  if exists (select 1 from information_schema.columns
              where table_schema = 'inventariado' and table_name = 'pruebas_usadas'
                and column_name = 'sync_xid') then
    raise exception 'FALLA: pruebas_usadas no debería sincronizarse';
  end if;
end;
$$;

\o
select 'Todas las pruebas SQL de una prueba por negocio pasaron';
