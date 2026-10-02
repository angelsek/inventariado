-- Pruebas de la suscripción con Google Play (usa datos de las pruebas anteriores).
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
select set_config('pruebas.negocio_ana', :'negocio_ana', false);

-- Precio del plan Pro para Play.
do $$
begin
  if (select precio_mensual from inventariado.planes where id = 'pro') <> 14990 then
    raise exception 'FALLA: el plan Pro no quedó en $14.990';
  end if;
end;
$$;

-- Un usuario común no puede aplicar compras (solo el servidor).
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$
begin
  perform inventariado.aplicar_compra_play('token-falso', current_setting('pruebas.negocio_ana')::uuid,
    'stockeao_pro', 'pro', 'SUBSCRIPTION_STATE_ACTIVE', now() + interval '1 year', true, null, true);
  raise exception 'FALLA: un usuario aplicó una compra de Google';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;

-- El servidor aplica una compra pendiente: se guarda, pero no da acceso.
set role service_role;
update inventariado.suscripciones set pagado_hasta = null, plan_id = 'pro'
 where negocio_id = :'negocio_ana';
select inventariado.aplicar_compra_play('token-1', :'negocio_ana', 'stockeao_basico', 'basico',
  'SUBSCRIPTION_STATE_PENDING', now() + interval '14 days', true, '00000000-0000-0000-0000-00000000000a', false);
do $$
begin
  if (select pagado_hasta from inventariado.suscripciones
       where negocio_id = current_setting('pruebas.negocio_ana')::uuid) is not null then
    raise exception 'FALLA: una compra pendiente activó la suscripción';
  end if;
end;
$$;

-- La compra queda activa (prueba de 14 días de Google): el negocio queda pagado hasta esa fecha.
select inventariado.aplicar_compra_play('token-1', :'negocio_ana', 'stockeao_basico', 'basico',
  'SUBSCRIPTION_STATE_ACTIVE', '2030-01-15T00:00:00Z', true, null, true);
do $$
declare
  s record;
  c record;
begin
  select * into s from inventariado.suscripciones
   where negocio_id = current_setting('pruebas.negocio_ana')::uuid;
  if s.plan_id <> 'basico' or s.pagado_hasta <> '2030-01-15T00:00:00Z'::timestamptz then
    raise exception 'FALLA: la suscripción no se actualizó: %', row_to_json(s);
  end if;
  select * into c from inventariado.compras_play where purchase_token = 'token-1';
  if c.estado <> 'SUBSCRIPTION_STATE_ACTIVE'
     or c.usuario_id <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'FALLA: la compra no se guardó bien: %', row_to_json(c);
  end if;
end;
$$;
reset role;

-- Ana ve sus compras; Beto no.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
do $$
begin
  if (select count(*) from inventariado.compras_play) <> 1 then
    raise exception 'FALLA: Ana no ve su compra';
  end if;
end;
$$;
reset role;
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$
begin
  if (select count(*) from inventariado.compras_play) <> 0 then
    raise exception 'FALLA: Beto ve las compras de Ana';
  end if;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
\o
\echo 'Todas las pruebas SQL de Google Play pasaron'
