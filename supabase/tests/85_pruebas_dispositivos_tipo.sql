-- Pruebas de la migración dispositivos_tipo (versión web: un PC ocupa cupo como un teléfono).
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

-- Negocio nuevo de Elena, en plan Básico (2 equipos).
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000e', 'elena@ejemplo.cl');
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
select inventariado.crear_negocio('Kiosko Elena', null, null, gen_random_uuid(), 'Elena', 'x') as negocio_elena \gset
reset role;
select set_config('pruebas.negocio_elena', :'negocio_elena', false);
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select inventariado.admin_actualizar_suscripcion(:'negocio_elena', 'basico');
reset role;

select pg_temp.como('00000000-0000-0000-0000-00000000000e');

-- La llamada de las apps Android (3 argumentos nombrados) sigue funcionando y deja 'telefono'.
select inventariado.registrar_dispositivo(
  p_id => '20000000-0000-0000-0000-0000000000e1',
  p_negocio_id => :'negocio_elena',
  p_nombre => 'Teléfono Elena');

-- Un PC ocupa el segundo cupo.
select inventariado.registrar_dispositivo(
  '20000000-0000-0000-0000-0000000000e2', :'negocio_elena', 'PC mesón', 'pc');

do $$
declare
  d jsonb := inventariado.mis_dispositivos(current_setting('pruebas.negocio_elena')::uuid);
begin
  if (select tipo from inventariado.dispositivos where id = '20000000-0000-0000-0000-0000000000e1') <> 'telefono' then
    raise exception 'FALLA: el teléfono no quedó con tipo telefono';
  end if;
  if (select tipo from inventariado.dispositivos where id = '20000000-0000-0000-0000-0000000000e2') <> 'pc' then
    raise exception 'FALLA: el PC no quedó con tipo pc';
  end if;
  if jsonb_array_length(d->'dispositivos') <> 2
     or not (d->'dispositivos') @> '[{"tipo": "pc", "nombre": "PC mesón"}]'::jsonb then
    raise exception 'FALLA: mis_dispositivos no informa el tipo: %', d;
  end if;
end;
$$;

-- Un segundo PC no entra: el plan ya tiene sus 2 equipos.
do $$
begin
  perform inventariado.registrar_dispositivo('20000000-0000-0000-0000-0000000000e3',
    current_setting('pruebas.negocio_elena')::uuid, 'PC bodega', 'pc');
  raise exception 'FALLA: un PC superó el límite de equipos';
exception when raise_exception then
  if sqlerrm <> 'LIMITE_DISPOSITIVOS' then raise; end if;
end;
$$;

-- Reemplazar el PC (mismo id, por ejemplo tras borrar los datos del navegador) no gasta cupo.
select inventariado.registrar_dispositivo(
  '20000000-0000-0000-0000-0000000000e2', :'negocio_elena', 'PC mesón nuevo', 'pc');
do $$
begin
  if (select count(*) from inventariado.dispositivos
       where negocio_id = current_setting('pruebas.negocio_elena')::uuid and not eliminado) <> 2 then
    raise exception 'FALLA: reemplazar el PC ocupó otro cupo';
  end if;
  if (select nombre from inventariado.dispositivos where id = '20000000-0000-0000-0000-0000000000e2')
     <> 'PC mesón nuevo' then
    raise exception 'FALLA: no se actualizó el nombre del PC reemplazado';
  end if;
end;
$$;

-- Un tipo desconocido se rechaza.
do $$
begin
  perform inventariado.registrar_dispositivo('20000000-0000-0000-0000-0000000000e4',
    current_setting('pruebas.negocio_elena')::uuid, 'Tablet', 'tablet');
  raise exception 'FALLA: se aceptó un tipo de equipo desconocido';
exception when invalid_parameter_value then
  null;
end;
$$;

-- La sincronización (que no envía tipo) no cambia el tipo de un PC ya registrado.
insert into inventariado.dispositivos (id, negocio_id, nombre)
values ('20000000-0000-0000-0000-0000000000e2', :'negocio_elena', 'PC mesón nuevo')
on conflict (id) do update set nombre = excluded.nombre;
do $$
begin
  if (select tipo from inventariado.dispositivos where id = '20000000-0000-0000-0000-0000000000e2') <> 'pc' then
    raise exception 'FALLA: sincronizar cambió el tipo del PC';
  end if;
end;
$$;
reset role;

-- Beto no puede tomar el id de un equipo de Elena (lo movería a su negocio).
select id as negocio_beto from inventariado.negocios where nombre = 'Almacén Beto' \gset
select set_config('pruebas.negocio_beto', :'negocio_beto', false);
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$
begin
  perform inventariado.registrar_dispositivo('20000000-0000-0000-0000-0000000000e2',
    current_setting('pruebas.negocio_beto')::uuid, 'Robado', 'pc');
  raise exception 'FALLA: Beto tomó un equipo de otro negocio';
exception when insufficient_privilege then
  if sqlerrm <> 'DISPOSITIVO_DE_OTRO_NEGOCIO' then raise; end if;
end;
$$;
reset role;
do $$
begin
  if (select negocio_id from inventariado.dispositivos where id = '20000000-0000-0000-0000-0000000000e2')
     <> current_setting('pruebas.negocio_elena')::uuid then
    raise exception 'FALLA: el PC de Elena cambió de negocio';
  end if;
end;
$$;

-- Un nombre vacío o muy largo se rechaza.
select pg_temp.como('00000000-0000-0000-0000-00000000000e');
do $$
begin
  perform inventariado.registrar_dispositivo('20000000-0000-0000-0000-0000000000e2',
    current_setting('pruebas.negocio_elena')::uuid, repeat('x', 61), 'pc');
  raise exception 'FALLA: se aceptó un nombre de equipo de 61 caracteres';
exception when invalid_parameter_value then
  null;
end;
$$;
reset role;

-- Nadie sin sesión puede registrar equipos.
select pg_temp.como(null);
do $$
begin
  perform inventariado.registrar_dispositivo('20000000-0000-0000-0000-0000000000e5',
    current_setting('pruebas.negocio_elena')::uuid, 'Intruso', 'pc');
  raise exception 'FALLA: anon registró un equipo';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;
