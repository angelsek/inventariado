-- Pruebas de la migración de fase 3 (usa datos de las pruebas de fases 1 y 2).
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

-- Ana registra una venta con un producto del catálogo y un monto libre, pagada en forma mixta.
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into inventariado.ventas (id, negocio_id, subtotal, descuento, total, efectivo_recibido, vuelto)
values ('f0000000-0000-0000-0000-000000000001', :'negocio_ana', 3580, 80, 3500, 2000, 500)
on conflict (id) do update set total = excluded.total;
insert into inventariado.venta_items (id, negocio_id, venta_id, producto_id, nombre, cantidad,
  precio_unitario, costo_unitario, total)
values
  ('f1000000-0000-0000-0000-000000000001', :'negocio_ana', 'f0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001', 'Cerveza lata 470cc', 2, 1290, 800, 2580),
  ('f1000000-0000-0000-0000-000000000002', :'negocio_ana', 'f0000000-0000-0000-0000-000000000001',
   null, 'Varios', 1, 1000, 0, 1000)
on conflict (id) do update set total = excluded.total;
insert into inventariado.pagos (id, negocio_id, venta_id, medio, monto)
values
  ('f2000000-0000-0000-0000-000000000001', :'negocio_ana', 'f0000000-0000-0000-0000-000000000001', 'efectivo', 1500),
  ('f2000000-0000-0000-0000-000000000002', :'negocio_ana', 'f0000000-0000-0000-0000-000000000001', 'debito', 2000)
on conflict (id) do update set monto = excluded.monto;

-- La anulación es un update del estado.
update inventariado.ventas
   set estado = 'anulada', anulada_en = now(), motivo_anulacion = 'Error de cobro'
 where id = 'f0000000-0000-0000-0000-000000000001';

do $$
declare
  d jsonb;
begin
  d := inventariado.sincronizar_descarga('ventas', current_setting('pruebas.negocio_ana')::uuid);
  if jsonb_array_length(d->'filas') <> 1 or d->'filas'->0->>'estado' <> 'anulada' then
    raise exception 'FALLA: descarga de ventas incorrecta: %', d;
  end if;
  d := inventariado.sincronizar_descarga('venta_items', current_setting('pruebas.negocio_ana')::uuid);
  if jsonb_array_length(d->'filas') <> 2 then
    raise exception 'FALLA: descarga de ítems incorrecta: %', d;
  end if;
  d := inventariado.sincronizar_descarga('pagos', current_setting('pruebas.negocio_ana')::uuid);
  if jsonb_array_length(d->'filas') <> 2 then
    raise exception 'FALLA: descarga de pagos incorrecta: %', d;
  end if;
end;
$$;

-- Validaciones.
do $$
begin
  insert into inventariado.pagos (id, negocio_id, venta_id, medio, monto)
  values (gen_random_uuid(), current_setting('pruebas.negocio_ana')::uuid,
          'f0000000-0000-0000-0000-000000000001', 'cheque', 100);
  raise exception 'FALLA: se aceptó un medio de pago inválido';
exception when check_violation then
  null;
end;
$$;

do $$
begin
  insert into inventariado.venta_items (id, negocio_id, venta_id, nombre, cantidad, precio_unitario, total)
  values (gen_random_uuid(), current_setting('pruebas.negocio_ana')::uuid,
          'f0000000-0000-0000-0000-000000000001', 'Cero', 0, 100, 0);
  raise exception 'FALLA: se aceptó una cantidad cero';
exception when check_violation then
  null;
end;
$$;
reset role;

-- Beto no ve ventas de Ana ni puede anularlas.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$
begin
  if (select count(*) from inventariado.ventas) <> 0
     or (select count(*) from inventariado.pagos) <> 0 then
    raise exception 'FALLA: Beto ve ventas o pagos de Ana';
  end if;
  update inventariado.ventas set estado = 'completada';
end;
$$;
reset role;

do $$
begin
  if (select estado from inventariado.ventas where id = 'f0000000-0000-0000-0000-000000000001') <> 'anulada' then
    raise exception 'FALLA: Beto cambió el estado de una venta de Ana';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '', false);
\o
\echo 'Todas las pruebas SQL de fase 3 pasaron'
