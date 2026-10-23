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

-- ===========================================================================
-- Casos límite (segunda pasada)
-- ===========================================================================

-- Ayudantes. Los ids se arman a partir de un texto hexadecimal corto para que se lean fácil.
create function pg_temp.u(p_hex text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-' || lpad(p_hex, 12, '0'))::uuid
$$;

create function pg_temp.usuario(p_hex text, p_correo text) returns uuid language plpgsql as $$
begin
  insert into auth.users (id, email) values (pg_temp.u(p_hex), p_correo);
  return pg_temp.u(p_hex);
end;
$$;

-- Crea un negocio como ese usuario (la función es security definer: lo que importa es auth.uid()).
create function pg_temp.nuevo(p_usuario uuid, p_nombre text, p_rut text, p_equipo uuid)
returns uuid language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_usuario::text, false);
  return inventariado.crear_negocio(p_nombre, p_rut, null, gen_random_uuid(), 'Dueño', 'x', p_equipo);
end;
$$;

-- Vincula el equipo al negocio, como hace la app justo después de crearlo.
create function pg_temp.vincular(p_usuario uuid, p_negocio uuid, p_equipo uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_usuario::text, false);
  perform inventariado.registrar_dispositivo(p_equipo, p_negocio, 'Teléfono');
end;
$$;

create function pg_temp.hasta(p_negocio uuid) returns timestamptz language sql as $$
  select prueba_hasta from inventariado.suscripciones where negocio_id = p_negocio;
$$;

-- Anota una llave como ya usada, con la fecha dada.
create function pg_temp.anotar(p_tipo text, p_valor text, p_hasta timestamptz)
returns void language sql as $$
  insert into inventariado.pruebas_usadas (llave_hash, tipo, prueba_hasta)
  values (inventariado.huella_prueba(p_tipo, p_valor), p_tipo, p_hasta)
  on conflict (llave_hash) do update set prueba_hasta = excluded.prueba_hasta;
$$;

create function pg_temp.fecha_llave(p_tipo text, p_valor text) returns timestamptz language sql as $$
  select prueba_hasta from inventariado.pruebas_usadas
   where llave_hash = inventariado.huella_prueba(p_tipo, p_valor);
$$;

-- ---------------------------------------------------------------------------
-- 11. Llaves con fechas distintas: gana la más temprana y nada se pisa
-- ---------------------------------------------------------------------------

do $$
declare
  v_uno timestamptz := date_trunc('second', now() + interval '1 day');
  v_cinco timestamptz := date_trunc('second', now() + interval '5 days');
  v_negocio uuid;
begin
  perform pg_temp.usuario('d01', 'm1@ejemplo.cl');
  perform pg_temp.usuario('d02', 'm2@ejemplo.cl');
  perform pg_temp.usuario('d03', 'm3@ejemplo.cl');
  perform pg_temp.anotar('correo', 'm1@ejemplo.cl', v_uno);
  perform pg_temp.anotar('equipo', pg_temp.u('f01')::text, v_cinco);

  -- Correo que vence en 1 día + equipo que vence en 5: se hereda el día más cercano.
  v_negocio := pg_temp.nuevo(pg_temp.u('d01'), 'Múltiple 1', '15.555.555-5', pg_temp.u('f01'));
  if pg_temp.hasta(v_negocio) <> v_uno then
    raise exception 'FALLA: con dos llaves conocidas debe ganar la fecha más temprana (% vs %)',
      pg_temp.hasta(v_negocio), v_uno;
  end if;
  -- La llave nueva (el RUT) se anota con la fecha heredada, y las que ya existían no se pisan.
  if pg_temp.fecha_llave('rut', '155555555') is distinct from v_uno then
    raise exception 'FALLA: el RUT nuevo no quedó anotado con la fecha heredada';
  end if;
  if pg_temp.fecha_llave('equipo', pg_temp.u('f01')::text) <> v_cinco then
    raise exception 'FALLA: se pisó la fecha de una llave que ya estaba anotada';
  end if;

  -- Solo el equipo (correo y RUT nuevos): hereda los 5 días de esa llave.
  v_negocio := pg_temp.nuevo(pg_temp.u('d02'), 'Múltiple 2', null, pg_temp.u('f01'));
  if pg_temp.hasta(v_negocio) <> v_cinco then
    raise exception 'FALLA: el equipo solo debería heredar sus 5 días: %', pg_temp.hasta(v_negocio);
  end if;

  -- Solo el RUT (equipo nulo): la llave anotada por el negocio anterior vale igual.
  v_negocio := pg_temp.nuevo(pg_temp.u('d03'), 'Múltiple 3', '15555555-5', null);
  if pg_temp.hasta(v_negocio) <> v_uno then
    raise exception 'FALLA: el RUT anotado por otro negocio debería heredar su fecha: %',
      pg_temp.hasta(v_negocio);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Equipo nulo (versión web o servidor sin la llave) y llamada de 6 argumentos
-- ---------------------------------------------------------------------------

do $$
declare
  v_antes bigint;
  v_negocio uuid;
  v_tipos text[];
begin
  perform pg_temp.usuario('d04', 'nulo1@ejemplo.cl');
  perform pg_temp.usuario('d05', 'nulo2@ejemplo.cl');
  perform pg_temp.usuario('d06', 'stale1@ejemplo.cl');
  perform pg_temp.usuario('d07', 'stale2@ejemplo.cl');

  -- p_equipo_id nulo y sin RUT: prueba normal y solo se anota el correo.
  select count(*) into v_antes from inventariado.pruebas_usadas;
  v_negocio := pg_temp.nuevo(pg_temp.u('d04'), 'Sin equipo', null, null);
  if pg_temp.hasta(v_negocio) < now() + interval '6 days 23 hours'
     or pg_temp.hasta(v_negocio) > now() + interval '7 days 1 minute' then
    raise exception 'FALLA: con equipo nulo la prueba debería ser de 7 días: %', pg_temp.hasta(v_negocio);
  end if;
  if (select count(*) from inventariado.pruebas_usadas) <> v_antes + 1 then
    raise exception 'FALLA: con equipo y RUT nulos solo debía anotarse la llave del correo';
  end if;
  select array_agg(tipo) into v_tipos from inventariado.pruebas_usadas
   where llave_hash = inventariado.huella_prueba('correo', 'nulo1@ejemplo.cl');
  if v_tipos is distinct from array['correo'] then
    raise exception 'FALLA: la llave anotada debería ser la del correo: %', v_tipos;
  end if;
  -- El valor nulo no deja una huella "de nada" que todos compartan.
  if exists (select 1 from inventariado.pruebas_usadas where llave_hash is null or llave_hash = '') then
    raise exception 'FALLA: se anotó una llave vacía';
  end if;

  -- Dos negocios sin equipo ni RUT y con correos distintos no se heredan entre sí.
  v_negocio := pg_temp.nuevo(pg_temp.u('d05'), 'Sin equipo 2', null, null);
  if pg_temp.hasta(v_negocio) < now() + interval '6 days 23 hours' then
    raise exception 'FALLA: dos negocios sin llaves en común no deberían heredarse: %',
      pg_temp.hasta(v_negocio);
  end if;
end;
$$;

-- El id del equipo de un negocio no se queda pegado para el siguiente en la misma transacción:
-- crear_negocio lo guarda en un ajuste de transacción, y si el siguiente no manda equipo debe
-- quedar vacío (si no, heredaría la llave de otro equipo).
do $$
declare
  v_uno timestamptz := date_trunc('second', now() + interval '1 day');
  v_negocio uuid;
begin
  perform pg_temp.anotar('equipo', pg_temp.u('f06')::text, v_uno);
  v_negocio := pg_temp.nuevo(pg_temp.u('d06'), 'Stale 1', null, pg_temp.u('f06'));
  if pg_temp.hasta(v_negocio) <> v_uno then
    raise exception 'FALLA: el primer negocio debía heredar el día del equipo conocido';
  end if;
  v_negocio := pg_temp.nuevo(pg_temp.u('d07'), 'Stale 2', null, null);
  if pg_temp.hasta(v_negocio) < now() + interval '6 days 23 hours' then
    raise exception 'FALLA: el equipo del negocio anterior se coló en el siguiente: %',
      pg_temp.hasta(v_negocio);
  end if;
end;
$$;

-- Compatibilidad con los APK ya instalados: llaman con argumentos nombrados y sin p_equipo_id.
select pg_temp.usuario('d08', 'apkviejo@ejemplo.cl');
select pg_temp.como(pg_temp.u('d08'));
select inventariado.crear_negocio(
  p_nombre => 'Almacén APK viejo', p_rut => '', p_direccion => null,
  p_perfil_id => gen_random_uuid(), p_nombre_dueno => 'Vieja', p_pin_hash => 'x')
  as negocio_apk_viejo \gset
select set_config('pruebas.apk_viejo', :'negocio_apk_viejo', false);
reset role;

do $$
begin
  if pg_temp.hasta(current_setting('pruebas.apk_viejo')::uuid) is null then
    raise exception 'FALLA: la llamada con 6 argumentos nombrados dejó al negocio sin prueba';
  end if;
  -- Queda una sola función crear_negocio (si no, la llamada de 6 argumentos sería ambigua).
  if (select count(*) from pg_proc
       where proname = 'crear_negocio' and pronamespace = 'inventariado'::regnamespace) <> 1 then
    raise exception 'FALLA: hay más de una función crear_negocio';
  end if;
  if (select pronargdefaults from pg_proc
       where proname = 'crear_negocio' and pronamespace = 'inventariado'::regnamespace) <> 1 then
    raise exception 'FALLA: p_equipo_id debería ser el único argumento con valor por defecto';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. El RUT escrito de cualquier forma es el mismo; lo que no es RUT no cuenta
-- ---------------------------------------------------------------------------

do $$
declare
  v_negocio uuid;
  v_ruts bigint;
begin
  perform pg_temp.usuario('d09', 'rut1@ejemplo.cl');
  perform pg_temp.usuario('d0a', 'rut2@ejemplo.cl');
  perform pg_temp.usuario('d0b', 'rut3@ejemplo.cl');
  perform pg_temp.usuario('d0c', 'rut4@ejemplo.cl');
  perform pg_temp.usuario('d0d', 'rut5@ejemplo.cl');
  perform pg_temp.anotar('rut', '11111111K', date_trunc('second', now() + interval '2 days'));

  -- Con puntos y guion, en minúscula; con espacios; sin separadores: todos son el mismo RUT.
  foreach v_negocio in array array[
    pg_temp.nuevo(pg_temp.u('d09'), 'Rut con puntos', '11.111.111-k', pg_temp.u('f09')),
    pg_temp.nuevo(pg_temp.u('d0a'), 'Rut con espacios', '  11 111 111 - K ', pg_temp.u('f0a')),
    pg_temp.nuevo(pg_temp.u('d0b'), 'Rut pegado', '11111111k', pg_temp.u('f0b'))
  ] loop
    if pg_temp.hasta(v_negocio) <> pg_temp.fecha_llave('rut', '11111111K') then
      raise exception 'FALLA: el RUT escrito de otra forma recibió otra fecha: %', pg_temp.hasta(v_negocio);
    end if;
  end loop;

  -- Otro RUT no hereda nada.
  v_negocio := pg_temp.nuevo(pg_temp.u('d0c'), 'Rut distinto', '22.222.222-2', pg_temp.u('f0c'));
  if pg_temp.hasta(v_negocio) < now() + interval '6 days 23 hours' then
    raise exception 'FALLA: un RUT distinto no debería heredar la fecha de otro: %', pg_temp.hasta(v_negocio);
  end if;

  -- Un texto que no es RUT no se anota ni hace heredar a nadie.
  select count(*) into v_ruts from inventariado.pruebas_usadas where tipo = 'rut';
  v_negocio := pg_temp.nuevo(pg_temp.u('d0d'), 'Rut basura', 'abc', pg_temp.u('f0d'));
  if (select count(*) from inventariado.pruebas_usadas where tipo = 'rut') <> v_ruts then
    raise exception 'FALLA: un RUT sin forma de RUT dejó una llave anotada';
  end if;
  if pg_temp.hasta(v_negocio) < now() + interval '6 days 23 hours' then
    raise exception 'FALLA: un RUT sin forma de RUT no debería heredar nada';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Eliminar el negocio no borra ninguna de las tres llaves
-- ---------------------------------------------------------------------------

do $$
declare
  v_negocio uuid;
begin
  perform pg_temp.usuario('d0e', 'borra1@ejemplo.cl');
  perform pg_temp.usuario('d0f', 'borra2@ejemplo.cl');
  perform pg_temp.usuario('d10', 'borra3@ejemplo.cl');
  v_negocio := pg_temp.nuevo(pg_temp.u('d0e'), 'Para borrar', '16.666.666-6', pg_temp.u('f0e'));
  perform pg_temp.vincular(pg_temp.u('d0e'), v_negocio, pg_temp.u('f0e'));
  perform set_config('pruebas.borrar', v_negocio::text, false);
  perform set_config('pruebas.borrar_hasta', pg_temp.hasta(v_negocio)::text, false);

  if (select count(*) from inventariado.llaves_del_negocio(v_negocio)) <> 3 then
    raise exception 'FALLA: el negocio debería tener correo, RUT y equipo como llaves';
  end if;
  -- La foto de la tabla antes de borrar el negocio.
  perform set_config('pruebas.tabla_antes',
    (select jsonb_object_agg(llave_hash, prueba_hasta) from inventariado.pruebas_usadas)::text, false);
end;
$$;

select pg_temp.como(pg_temp.u('d0e'));
select inventariado.eliminar_mi_negocio(current_setting('pruebas.borrar')::uuid);
reset role;

do $$
declare
  v_negocio uuid;
  v_hasta timestamptz := current_setting('pruebas.borrar_hasta')::timestamptz;
begin
  if (select jsonb_object_agg(llave_hash, prueba_hasta) from inventariado.pruebas_usadas)
     is distinct from current_setting('pruebas.tabla_antes')::jsonb then
    raise exception 'FALLA: eliminar el negocio cambió el registro de pruebas usadas';
  end if;
  -- El negocio ya no existe, pero las tres llaves siguen ahí con su fecha original.
  if exists (select 1 from inventariado.negocios where id = current_setting('pruebas.borrar')::uuid) then
    raise exception 'FALLA: el negocio no se eliminó';
  end if;
  if pg_temp.fecha_llave('correo', 'borra1@ejemplo.cl') is distinct from v_hasta
     or pg_temp.fecha_llave('rut', '166666666') is distinct from v_hasta
     or pg_temp.fecha_llave('equipo', pg_temp.u('f0e')::text) is distinct from v_hasta then
    raise exception 'FALLA: alguna de las tres llaves no sobrevivió a eliminar el negocio';
  end if;
  -- La tabla no guarda a qué negocio pertenecía cada llave.
  if exists (select 1 from information_schema.columns
              where table_schema = 'inventariado' and table_name = 'pruebas_usadas'
                and column_name in ('negocio_id', 'usuario_id', 'correo', 'rut', 'equipo_id')) then
    raise exception 'FALLA: pruebas_usadas guarda datos que identifican al negocio';
  end if;

  -- Cada llave por separado cierra el ciclo: solo el equipo, y solo el RUT.
  v_negocio := pg_temp.nuevo(pg_temp.u('d0f'), 'Borrado: equipo', null, pg_temp.u('f0e'));
  if pg_temp.hasta(v_negocio) <> v_hasta then
    raise exception 'FALLA: el equipo de un negocio borrado debería heredar su fecha: %',
      pg_temp.hasta(v_negocio);
  end if;
  v_negocio := pg_temp.nuevo(pg_temp.u('d10'), 'Borrado: RUT', '16666666-6', pg_temp.u('f10'));
  if pg_temp.hasta(v_negocio) <> v_hasta then
    raise exception 'FALLA: el RUT de un negocio borrado debería heredar su fecha: %',
      pg_temp.hasta(v_negocio);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 15. admin_liberar_prueba a fondo
-- ---------------------------------------------------------------------------

do $$
declare
  v_bloqueado uuid;
  v_otro uuid;
begin
  perform pg_temp.usuario('d11', 'liberar1@ejemplo.cl');
  perform pg_temp.usuario('d12', 'liberar2@ejemplo.cl');
  perform pg_temp.usuario('d13', 'liberar3@ejemplo.cl');
  perform pg_temp.anotar('correo', 'liberar1@ejemplo.cl', now() - interval '10 days');

  v_bloqueado := pg_temp.nuevo(pg_temp.u('d11'), 'Bloqueado', '17.777.777-7', pg_temp.u('f11'));
  perform pg_temp.vincular(pg_temp.u('d11'), v_bloqueado, pg_temp.u('f11'));
  perform set_config('pruebas.bloqueado', v_bloqueado::text, false);

  if pg_temp.hasta(v_bloqueado) is not null then
    raise exception 'FALLA: el negocio con el correo vencido debería nacer sin prueba';
  end if;
  -- El equipo también quedó anotado como vencido: otro correo en el mismo equipo tampoco recibe prueba.
  v_otro := pg_temp.nuevo(pg_temp.u('d12'), 'Mismo equipo', null, pg_temp.u('f11'));
  if pg_temp.hasta(v_otro) is not null then
    raise exception 'FALLA: el equipo con la prueba vencida no debería dar días nuevos';
  end if;
  -- Se marca también una suspensión manual, para ver que liberar la levanta.
  update inventariado.suscripciones set suspendida = true where negocio_id = v_bloqueado;
  -- Se pierde el registro (como si alguien lo hubiera borrado a mano): liberar debe volver a anotarlo.
  delete from inventariado.pruebas_usadas
   where llave_hash in (select llave_hash from inventariado.llaves_del_negocio(v_bloqueado));
  if exists (select 1 from inventariado.llaves_del_negocio(v_bloqueado) k
               join inventariado.pruebas_usadas u on u.llave_hash = k.llave_hash) then
    raise exception 'FALLA: la preparación de la prueba no borró el registro';
  end if;
end;
$$;

select pg_temp.como(pg_temp.u('c9'));
select inventariado.admin_liberar_prueba(current_setting('pruebas.bloqueado')::uuid, 3) as liberada \gset
-- Repetir la liberación no falla ni duplica llaves.
select inventariado.admin_liberar_prueba(current_setting('pruebas.bloqueado')::uuid, 3) as liberada_2 \gset
reset role;

do $$
declare
  v_negocio uuid := current_setting('pruebas.bloqueado')::uuid;
  v_hasta timestamptz := pg_temp.hasta(v_negocio);
  v_nuevo uuid;
  v_estado text;
begin
  if v_hasta < now() + interval '2 days 23 hours' or v_hasta > now() + interval '3 days 1 minute' then
    raise exception 'FALLA: liberar con 3 días dejó la prueba en %', v_hasta;
  end if;
  select inventariado.estado_suscripcion(s) into v_estado from inventariado.suscripciones s
   where s.negocio_id = v_negocio;
  if v_estado <> 'prueba' then
    raise exception 'FALLA: el negocio liberado no quedó en prueba: %', v_estado;
  end if;
  if (select suspendida from inventariado.suscripciones where negocio_id = v_negocio) then
    raise exception 'FALLA: liberar no levantó la suspensión';
  end if;
  if inventariado.prueba_bloqueada(v_negocio) then
    raise exception 'FALLA: el negocio liberado sigue marcado como bloqueado';
  end if;
  -- Las tres llaves volvieron a anotarse (el registro estaba vacío) con la fecha nueva.
  if (select count(*) from inventariado.llaves_del_negocio(v_negocio) k
        join inventariado.pruebas_usadas u on u.llave_hash = k.llave_hash
       where u.prueba_hasta = v_hasta) <> 3 then
    raise exception 'FALLA: liberar no volvió a anotar las tres llaves con la fecha nueva';
  end if;
  -- Y siguen siendo una sola prueba: otro correo en el mismo equipo hereda esta fecha, no 7 días.
  v_nuevo := pg_temp.nuevo(pg_temp.u('d13'), 'Después de liberar', null, pg_temp.u('f11'));
  if pg_temp.hasta(v_nuevo) is distinct from v_hasta then
    raise exception 'FALLA: después de liberar, el equipo debería heredar la fecha nueva (% vs %)',
      pg_temp.hasta(v_nuevo), v_hasta;
  end if;
end;
$$;

-- Negocio que no existe y días fuera de rango o nulos.
do $$
declare
  v_antes bigint;
  v_negocio uuid := current_setting('pruebas.bloqueado')::uuid;
  v_dias integer;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('c9')::text, false);
  select count(*) into v_antes from inventariado.pruebas_usadas;

  begin
    perform inventariado.admin_liberar_prueba(gen_random_uuid(), 7);
    raise exception 'FALLA: se liberó la prueba de un negocio que no existe';
  exception
    when no_data_found then null;
  end;
  if (select count(*) from inventariado.pruebas_usadas) <> v_antes then
    raise exception 'FALLA: liberar un negocio inexistente cambió el registro';
  end if;

  foreach v_dias in array array[-1, 366] loop
    begin
      perform inventariado.admin_liberar_prueba(v_negocio, v_dias);
      raise exception 'FALLA: se aceptaron % días de prueba', v_dias;
    exception
      when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform inventariado.admin_liberar_prueba(v_negocio, null);
    raise exception 'FALLA: se aceptó un número de días nulo';
  exception
    when invalid_parameter_value then null;
  end;
  -- Los extremos permitidos sí.
  perform inventariado.admin_liberar_prueba(v_negocio, 365);
  perform inventariado.admin_liberar_prueba(v_negocio, 1);
end;
$$;

-- Ni un usuario común ni alguien sin sesión pueden liberar o ver el panel.
select pg_temp.como(pg_temp.u('d11'));
do $$
begin
  begin
    perform inventariado.admin_liberar_prueba(current_setting('pruebas.bloqueado')::uuid, 7);
    raise exception 'FALLA: un dueño pudo liberar su propia prueba';
  exception
    when insufficient_privilege then null;
  end;
  begin
    perform inventariado.admin_listar_negocios();
    raise exception 'FALLA: un dueño pudo listar los negocios del panel';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select pg_temp.como(null);
do $$
begin
  begin
    perform inventariado.admin_liberar_prueba(current_setting('pruebas.bloqueado')::uuid, 7);
    raise exception 'FALLA: alguien sin sesión pudo liberar una prueba';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- El panel marca al negocio bloqueado, pero no deja ver ninguna huella de pruebas_usadas.
select pg_temp.como(pg_temp.u('c9'));
select set_config('pruebas.lista_panel', inventariado.admin_listar_negocios()::text, false);
reset role;
do $$
declare
  v_lista text := current_setting('pruebas.lista_panel');
begin
  if v_lista not like '%"prueba_bloqueada"%' then
    raise exception 'FALLA: la lista de administración no trae prueba_bloqueada';
  end if;
  if exists (select 1 from inventariado.pruebas_usadas where position(llave_hash in v_lista) > 0) then
    raise exception 'FALLA: la lista de administración deja ver una huella de pruebas_usadas';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 16. Nadie lee ni toca pruebas_usadas ni llama a las funciones internas desde la app
-- ---------------------------------------------------------------------------

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'inventariado.pruebas_usadas'::regclass) then
    raise exception 'FALLA: pruebas_usadas debería tener RLS activa';
  end if;
  if not has_table_privilege('service_role', 'inventariado.pruebas_usadas', 'select') then
    raise exception 'FALLA: service_role debería poder leer pruebas_usadas';
  end if;
end;
$$;

-- Con sesión de usuario normal.
select pg_temp.como(pg_temp.u('d11'));
do $$
declare
  v_sql text;
begin
  -- Tabla: ni leer, ni insertar, ni cambiar, ni borrar.
  foreach v_sql in array array[
    'select * from inventariado.pruebas_usadas',
    'select count(*) from inventariado.pruebas_usadas',
    'insert into inventariado.pruebas_usadas (llave_hash, tipo, prueba_hasta) values (''x'', ''rut'', now())',
    'update inventariado.pruebas_usadas set prueba_hasta = now() + interval ''99 days''',
    'delete from inventariado.pruebas_usadas',
    'truncate inventariado.pruebas_usadas'
  ] loop
    begin
      execute v_sql;
      raise exception 'FALLA: se pudo ejecutar con sesión de usuario: %', v_sql;
    exception
      when insufficient_privilege then null;
    end;
  end loop;

  -- Funciones internas: ninguna se puede llamar.
  foreach v_sql in array array[
    'select inventariado.consumir_prueba(''a@b.cl'', null, null)',
    'select * from inventariado.llaves_de_prueba(''a@b.cl'', ''12345678-5'', null)',
    'select * from inventariado.llaves_del_negocio(gen_random_uuid())',
    'select inventariado.huella_prueba(''rut'', ''123456785'')',
    'select inventariado.normalizar_correo(''a@b.cl'')',
    'select inventariado.normalizar_rut(''12345678-5'')',
    'select inventariado.prueba_bloqueada(gen_random_uuid())',
    'select inventariado.crear_suscripcion_de_prueba()'
  ] loop
    begin
      execute v_sql;
      raise exception 'FALLA: se pudo llamar con sesión de usuario: %', v_sql;
    exception
      when insufficient_privilege then null;
    end;
  end loop;

  -- La descarga de sincronización rechaza la tabla.
  begin
    perform inventariado.sincronizar_descarga(
      'pruebas_usadas', current_setting('pruebas.bloqueado')::uuid, null);
    raise exception 'FALLA: sincronizar_descarga entregó pruebas_usadas';
  exception
    when invalid_parameter_value then null;
  end;
end;
$$;
reset role;

-- Sin sesión (anon): tampoco.
select pg_temp.como(null);
do $$
declare
  v_sql text;
begin
  foreach v_sql in array array[
    'select * from inventariado.pruebas_usadas',
    'select inventariado.consumir_prueba(''a@b.cl'', null, null)',
    'select inventariado.prueba_bloqueada(gen_random_uuid())',
    'select * from inventariado.llaves_del_negocio(gen_random_uuid())',
    'select inventariado.admin_listar_negocios()',
    'select inventariado.crear_negocio(''x'', null, null, gen_random_uuid(), ''x'', ''x'', null)',
    'select inventariado.crear_negocio(''x'', null, null, gen_random_uuid(), ''x'', ''x'')'
  ] loop
    begin
      execute v_sql;
      raise exception 'FALLA: se pudo ejecutar sin sesión: %', v_sql;
    exception
      when insufficient_privilege then null;
    end;
  end loop;
end;
$$;
reset role;

-- ---------------------------------------------------------------------------
-- 17. Volver a ejecutar la migración con datos: no rompe nada y anota a los negocios de antes
-- ---------------------------------------------------------------------------

do $$
declare
  v_antes uuid;
  v_sin_prueba uuid;
  v_a uuid;
  v_b uuid;
begin
  perform pg_temp.usuario('d14', 'antes1@ejemplo.cl');
  perform pg_temp.usuario('d15', 'antes2@ejemplo.cl');
  perform pg_temp.usuario('d16', 'antes3@ejemplo.cl');
  perform pg_temp.usuario('d17', 'antes4@ejemplo.cl');

  -- Un negocio "de antes de la migración": existe, tiene prueba y no está en el registro.
  v_antes := pg_temp.nuevo(pg_temp.u('d14'), 'Negocio de antes', '20.000.000-k', pg_temp.u('f14'));
  perform pg_temp.vincular(pg_temp.u('d14'), v_antes, pg_temp.u('f14'));
  update inventariado.suscripciones set prueba_hasta = date_trunc('second', now() + interval '2 days')
   where negocio_id = v_antes;
  delete from inventariado.pruebas_usadas
   where llave_hash in (select llave_hash from inventariado.llaves_del_negocio(v_antes));
  perform set_config('pruebas.antes', v_antes::text, false);

  -- Uno que nunca tuvo prueba (por ejemplo, de Google Play): no se anota.
  v_sin_prueba := pg_temp.nuevo(pg_temp.u('d15'), 'Negocio sin prueba', null, null);
  update inventariado.suscripciones set prueba_hasta = null where negocio_id = v_sin_prueba;
  delete from inventariado.pruebas_usadas
   where llave_hash in (select llave_hash from inventariado.llaves_del_negocio(v_sin_prueba));
  perform set_config('pruebas.sin_prueba', v_sin_prueba::text, false);

  -- Dos negocios con el mismo RUT y fechas distintas: se queda la más temprana, sin error.
  v_a := pg_temp.nuevo(pg_temp.u('d16'), 'Mismo RUT A', '21.000.000-1', null);
  v_b := pg_temp.nuevo(pg_temp.u('d17'), 'Mismo RUT B', '21.000.000-1', null);
  update inventariado.suscripciones set prueba_hasta = date_trunc('second', now() + interval '3 days')
   where negocio_id = v_a;
  update inventariado.suscripciones set prueba_hasta = date_trunc('second', now() + interval '1 day')
   where negocio_id = v_b;
  delete from inventariado.pruebas_usadas where llave_hash in (
    select llave_hash from inventariado.llaves_del_negocio(v_a)
    union select llave_hash from inventariado.llaves_del_negocio(v_b));

  -- Una llave que ya estaba anotada con otra fecha no se pisa.
  perform pg_temp.anotar('correo', 'antes1@ejemplo.cl', date_trunc('second', now() + interval '9 days'));
  perform set_config('pruebas.nueve', pg_temp.fecha_llave('correo', 'antes1@ejemplo.cl')::text, false);
end;
$$;

\ir ../migrations/20261023000100_una_prueba_por_negocio.sql

do $$
declare
  v_antes uuid := current_setting('pruebas.antes')::uuid;
  v_sin_prueba uuid := current_setting('pruebas.sin_prueba')::uuid;
  v_hasta timestamptz := pg_temp.hasta(v_antes);
begin
  -- El negocio de antes quedó anotado con la fecha de su prueba (RUT y equipo).
  if pg_temp.fecha_llave('rut', '20000000K') is distinct from v_hasta
     or pg_temp.fecha_llave('equipo', pg_temp.u('f14')::text) is distinct from v_hasta then
    raise exception 'FALLA: la migración no anotó el RUT y el equipo del negocio existente';
  end if;
  -- El correo ya estaba anotado con otra fecha: no se pisa.
  if pg_temp.fecha_llave('correo', 'antes1@ejemplo.cl') is distinct from
     current_setting('pruebas.nueve')::timestamptz then
    raise exception 'FALLA: la migración pisó una llave ya anotada';
  end if;
  -- El que no tenía prueba no queda anotado.
  if exists (select 1 from inventariado.llaves_del_negocio(v_sin_prueba) k
              join inventariado.pruebas_usadas u on u.llave_hash = k.llave_hash) then
    raise exception 'FALLA: la migración anotó a un negocio que nunca tuvo prueba';
  end if;
  -- El mismo RUT en dos negocios: queda la fecha más temprana.
  if pg_temp.fecha_llave('rut', '210000001') is distinct from date_trunc('second', now() + interval '1 day') then
    raise exception 'FALLA: con el RUT repetido debía quedar la fecha más temprana: %',
      pg_temp.fecha_llave('rut', '210000001');
  end if;
  -- Sigue habiendo una sola función crear_negocio y un solo trigger de suscripción.
  if (select count(*) from pg_proc
       where proname = 'crear_negocio' and pronamespace = 'inventariado'::regnamespace) <> 1 then
    raise exception 'FALLA: después de repetir la migración hay más de un crear_negocio';
  end if;
  if (select count(*) from pg_trigger where tgname = 'negocios_suscripcion'
        and tgrelid = 'inventariado.negocios'::regclass) <> 1 then
    raise exception 'FALLA: el trigger de la suscripción no es único';
  end if;
  -- Y los permisos siguen bien.
  if has_table_privilege('authenticated', 'inventariado.pruebas_usadas', 'select')
     or has_function_privilege('authenticated', 'inventariado.consumir_prueba(text, text, uuid)', 'execute')
     or not has_function_privilege('authenticated',
          'inventariado.crear_negocio(text, text, text, uuid, text, text, uuid)', 'execute')
     or has_function_privilege('anon',
          'inventariado.crear_negocio(text, text, text, uuid, text, text, uuid)', 'execute') then
    raise exception 'FALLA: repetir la migración dejó mal los permisos';
  end if;
end;
$$;

\o
select 'Todas las pruebas SQL de una prueba por negocio pasaron';
