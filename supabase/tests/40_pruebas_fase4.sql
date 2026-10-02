-- Pruebas de la migración de fase 4 (usa datos de las pruebas anteriores).
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

select pg_temp.como('00000000-0000-0000-0000-00000000000a');

-- Proveedor, compra e ítem.
insert into inventariado.proveedores (id, negocio_id, nombre, rut)
values ('a1000000-0000-0000-0000-000000000001', :'negocio_ana', 'Distribuidora Sur', '76.123.456-7')
on conflict (id) do update set nombre = excluded.nombre;
insert into inventariado.compras (id, negocio_id, proveedor_id, documento, total)
values ('a2000000-0000-0000-0000-000000000001', :'negocio_ana',
  'a1000000-0000-0000-0000-000000000001', 'Factura 123', 19200)
on conflict (id) do update set total = excluded.total;
insert into inventariado.compra_items (id, negocio_id, compra_id, producto_id, nombre, cantidad, costo_unitario, total)
values ('a3000000-0000-0000-0000-000000000001', :'negocio_ana', 'a2000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001', 'Cerveza lata 470cc', 24, 800, 19200)
on conflict (id) do update set total = excluded.total;

-- Caja con un retiro y una venta ligada.
insert into inventariado.cajas (id, negocio_id, abierta_en, monto_inicial)
values ('a4000000-0000-0000-0000-000000000001', :'negocio_ana', now(), 20000)
on conflict (id) do update set monto_inicial = excluded.monto_inicial;
insert into inventariado.movimientos_caja (id, negocio_id, caja_id, tipo, monto, motivo)
values ('a5000000-0000-0000-0000-000000000001', :'negocio_ana',
  'a4000000-0000-0000-0000-000000000001', 'retiro', 5000, 'Pago hielo')
on conflict (id) do update set monto = excluded.monto;
update inventariado.ventas set caja_id = 'a4000000-0000-0000-0000-000000000001'
 where id = 'f0000000-0000-0000-0000-000000000001';
update inventariado.cajas
   set cerrada_en = now(), efectivo_esperado = 15000, monto_contado = 14800
 where id = 'a4000000-0000-0000-0000-000000000001';

do $$
declare
  t text;
  d jsonb;
begin
  foreach t in array array['proveedores', 'compras', 'compra_items', 'cajas', 'movimientos_caja'] loop
    d := inventariado.sincronizar_descarga(t, current_setting('pruebas.negocio_ana')::uuid);
    if jsonb_array_length(d->'filas') <> 1 then
      raise exception 'FALLA: descarga de % incorrecta: %', t, d;
    end if;
  end loop;

  d := inventariado.sincronizar_descarga('ventas', current_setting('pruebas.negocio_ana')::uuid);
  if d->'filas'->0->>'caja_id' <> 'a4000000-0000-0000-0000-000000000001' then
    raise exception 'FALLA: la venta no quedó ligada a la caja: %', d;
  end if;
end;
$$;

do $$
begin
  insert into inventariado.movimientos_caja (id, negocio_id, caja_id, tipo, monto)
  values (gen_random_uuid(), current_setting('pruebas.negocio_ana')::uuid,
          'a4000000-0000-0000-0000-000000000001', 'prestamo', 100);
  raise exception 'FALLA: se aceptó un tipo de movimiento de caja inválido';
exception when check_violation then
  null;
end;
$$;
reset role;

-- Beto no ve nada de esto.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$
begin
  if (select count(*) from inventariado.proveedores) + (select count(*) from inventariado.compras)
     + (select count(*) from inventariado.cajas) + (select count(*) from inventariado.movimientos_caja) <> 0 then
    raise exception 'FALLA: Beto ve datos de fase 4 de Ana';
  end if;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
\o
\echo 'Todas las pruebas SQL de fase 4 pasaron'
