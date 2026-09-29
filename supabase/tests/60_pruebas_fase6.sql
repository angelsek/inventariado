-- Pruebas de la migración de fase 6 (usa datos de las pruebas anteriores).
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

-- Versiones: el workflow publica con service_role; cualquiera (incluso sin sesión) consulta la última.
insert into inventariado.versiones_app (version_code, version, url, notas)
values (14, '0.1.0', 'https://ejemplo/apk/inventariado-14.apk', 'Primera versión del piloto'),
       (15, '0.1.1', 'https://ejemplo/apk/inventariado-15.apk', 'Correcciones')
on conflict (version_code) do nothing;

select pg_temp.como(null);
do $$
declare
  v jsonb := inventariado.ultima_version();
begin
  if (v->>'version_code')::int <> 15 or v->>'version' <> '0.1.1' then
    raise exception 'FALLA: ultima_version incorrecta: %', v;
  end if;
end;
$$;
do $$
begin
  insert into inventariado.versiones_app (version_code, version, url) values (99, 'x', 'x');
  raise exception 'FALLA: anon publicó una versión';
exception when insufficient_privilege then
  null;
end;
$$;

-- Un error se puede informar sin sesión (ej. al abrir la app), sin negocio asociado.
select inventariado.registrar_error('Falla al abrir', 'stack...', '0.1.0 (15)', 'Samsung A15', :'negocio_ana');
reset role;

-- Ana informa un error y un comentario de su negocio; no puede comentar por Beto.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select inventariado.registrar_error(repeat('x', 900), null, '0.1.0 (15)', 'Motorola', :'negocio_ana');
select inventariado.enviar_comentario(:'negocio_ana', '  Sería útil ver las ventas por hora  ', 'Ana', '0.1.0 (15)');
do $$
begin
  perform inventariado.enviar_comentario(current_setting('pruebas.negocio_beto')::uuid, 'Intruso');
  raise exception 'FALLA: Ana comentó en el negocio de Beto';
exception when insufficient_privilege then
  null;
end;
$$;
do $$
begin
  perform count(*) from inventariado.comentarios;
  raise exception 'FALLA: Ana puede leer la tabla de comentarios';
exception when insufficient_privilege then
  null;
end;
$$;
do $$
begin
  perform inventariado.admin_listar_reportes();
  raise exception 'FALLA: Ana listó reportes';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;

do $$
begin
  if (select negocio_id from inventariado.errores_app where mensaje = 'Falla al abrir') is not null then
    raise exception 'FALLA: un error sin sesión quedó asociado a un negocio';
  end if;
  if (select length(mensaje) from inventariado.errores_app where dispositivo = 'Motorola') <> 500 then
    raise exception 'FALLA: el mensaje del error no se recortó';
  end if;
end;
$$;

-- La administradora ve comentarios y errores y marca un comentario como leído.
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
do $$
declare
  r jsonb := inventariado.admin_listar_reportes();
  comentario jsonb := r->'comentarios'->0;
begin
  if jsonb_array_length(r->'comentarios') <> 1 or jsonb_array_length(r->'errores') <> 2 then
    raise exception 'FALLA: reportes incorrectos: %', r;
  end if;
  if comentario->>'texto' <> 'Sería útil ver las ventas por hora' or comentario->>'negocio' not like 'Botillería Ana%' then
    raise exception 'FALLA: comentario incorrecto: %', comentario;
  end if;
  perform inventariado.admin_marcar_comentario((comentario->>'id')::uuid, true);
end;
$$;
reset role;

do $$
begin
  if not (select leido from inventariado.comentarios limit 1) then
    raise exception 'FALLA: el comentario no quedó leído';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '', false);
\o
\echo 'Todas las pruebas SQL de fase 6 pasaron'
