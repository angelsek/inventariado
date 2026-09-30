-- Pruebas de la migración de fase 8 (usa datos de las pruebas anteriores).
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

-- Cliente con una venta fiada, un abono y un pago con medio 'fiado'.
insert into inventariado.clientes (id, negocio_id, nombre, telefono, limite_credito)
values ('b1000000-0000-0000-0000-000000000001', :'negocio_ana', 'Don Juan', '+56911112222', 50000)
on conflict (id) do update set nombre = excluded.nombre;
update inventariado.ventas set cliente_id = 'b1000000-0000-0000-0000-000000000001'
 where id = 'f0000000-0000-0000-0000-000000000001';
insert into inventariado.pagos (id, negocio_id, venta_id, medio, monto)
values ('b2000000-0000-0000-0000-000000000001', :'negocio_ana',
  'f0000000-0000-0000-0000-000000000001', 'fiado', 1000)
on conflict (id) do update set monto = excluded.monto;
insert into inventariado.movimientos_cliente (id, negocio_id, cliente_id, tipo, monto, venta_id)
values ('b3000000-0000-0000-0000-000000000001', :'negocio_ana',
  'b1000000-0000-0000-0000-000000000001', 'cargo', 1000, 'f0000000-0000-0000-0000-000000000001')
on conflict (id) do update set monto = excluded.monto;
insert into inventariado.movimientos_cliente (id, negocio_id, cliente_id, tipo, monto, medio)
values ('b3000000-0000-0000-0000-000000000002', :'negocio_ana',
  'b1000000-0000-0000-0000-000000000001', 'abono', 400, 'efectivo')
on conflict (id) do update set monto = excluded.monto;

-- Producto con envase, pack y promoción; categoría de alcohol; horario del negocio.
update inventariado.productos
   set precio_envase = 300, promo_cantidad = 3, promo_precio = 3000
 where id = 'd0000000-0000-0000-0000-000000000001';
insert into inventariado.productos (id, negocio_id, nombre, precio_venta, pack_producto_id, pack_cantidad)
values ('b4000000-0000-0000-0000-000000000001', :'negocio_ana', 'Six pack', 6500,
  'd0000000-0000-0000-0000-000000000001', 6)
on conflict (id) do update set pack_cantidad = excluded.pack_cantidad;
update inventariado.categorias set alcohol = true where negocio_id = :'negocio_ana';
update inventariado.negocios set alcohol_desde = '10:00', alcohol_hasta = '02:00'
 where id = :'negocio_ana';

do $$
declare
  t text;
  d jsonb;
begin
  foreach t in array array['clientes', 'movimientos_cliente'] loop
    d := inventariado.sincronizar_descarga(t, current_setting('pruebas.negocio_ana')::uuid);
    if jsonb_array_length(d->'filas') < 1 then
      raise exception 'FALLA: descarga de % incorrecta: %', t, d;
    end if;
  end loop;

  d := inventariado.sincronizar_descarga('negocios', current_setting('pruebas.negocio_ana')::uuid);
  if d->'filas'->0->>'alcohol_hasta' <> '02:00' then
    raise exception 'FALLA: no se descarga el horario de alcohol: %', d;
  end if;

  if (select sum(case tipo when 'cargo' then monto else -monto end)
        from inventariado.movimientos_cliente
       where cliente_id = 'b1000000-0000-0000-0000-000000000001') <> 600 then
    raise exception 'FALLA: saldo del cliente incorrecto';
  end if;
end;
$$;

-- Valores inválidos.
do $$
begin
  insert into inventariado.movimientos_cliente (id, negocio_id, cliente_id, tipo, monto)
  values (gen_random_uuid(), current_setting('pruebas.negocio_ana')::uuid,
          'b1000000-0000-0000-0000-000000000001', 'regalo', 100);
  raise exception 'FALLA: se aceptó un tipo de movimiento de cliente inválido';
exception when check_violation then
  null;
end;
$$;
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
  update inventariado.negocios set alcohol_desde = '25 horas'
   where id = current_setting('pruebas.negocio_ana')::uuid;
  raise exception 'FALLA: se aceptó un horario inválido';
exception when check_violation then
  null;
end;
$$;
reset role;

-- Beto no ve los clientes de Ana ni puede crearle movimientos.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$
begin
  if (select count(*) from inventariado.clientes)
     + (select count(*) from inventariado.movimientos_cliente) <> 0 then
    raise exception 'FALLA: Beto ve el fiado de Ana';
  end if;
  begin
    insert into inventariado.movimientos_cliente (id, negocio_id, cliente_id, tipo, monto)
    values (gen_random_uuid(), current_setting('pruebas.negocio_ana')::uuid,
            'b1000000-0000-0000-0000-000000000001', 'abono', 100);
    raise exception 'FALLA: Beto registró un abono en el negocio de Ana';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
\o
\echo 'Todas las pruebas SQL de fase 8 pasaron'
