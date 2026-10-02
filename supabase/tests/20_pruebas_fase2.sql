-- Pruebas de la migración de fase 2 (usa los negocios creados en 10_pruebas_fase1.sql).
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

-- Ana crea una categoría, un producto y su stock inicial (con upsert, como la app).
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
insert into inventariado.categorias (id, negocio_id, nombre)
values ('c0000000-0000-0000-0000-000000000001', :'negocio_ana', 'Cervezas')
on conflict (id) do update set nombre = excluded.nombre;
insert into inventariado.productos (id, negocio_id, nombre, codigo_barras, categoria_id,
  precio_venta, costo, stock_minimo, unidad)
values ('d0000000-0000-0000-0000-000000000001', :'negocio_ana', 'Cerveza lata 470cc',
  '7801234567890', 'c0000000-0000-0000-0000-000000000001', 1290, 800, 6, 'unidad')
on conflict (id) do update set precio_venta = excluded.precio_venta;
insert into inventariado.movimientos_stock (id, negocio_id, producto_id, tipo, cantidad)
values ('e0000000-0000-0000-0000-000000000001', :'negocio_ana',
  'd0000000-0000-0000-0000-000000000001', 'inicial', 24)
on conflict (id) do update set cantidad = excluded.cantidad;

-- Reintento de subida del mismo movimiento: no duplica.
insert into inventariado.movimientos_stock (id, negocio_id, producto_id, tipo, cantidad)
values ('e0000000-0000-0000-0000-000000000001', :'negocio_ana',
  'd0000000-0000-0000-0000-000000000001', 'inicial', 24)
on conflict (id) do update set cantidad = excluded.cantidad;

do $$
declare
  d jsonb;
begin
  if (select sum(cantidad) from inventariado.movimientos_stock) <> 24 then
    raise exception 'FALLA: el stock de Ana debería ser 24';
  end if;

  d := inventariado.sincronizar_descarga('productos', current_setting('pruebas.negocio_ana')::uuid);
  if jsonb_array_length(d->'filas') <> 1 or d->'filas'->0->>'precio_venta' <> '1290' then
    raise exception 'FALLA: descarga de productos incorrecta: %', d;
  end if;

  d := inventariado.sincronizar_descarga('movimientos_stock', current_setting('pruebas.negocio_ana')::uuid);
  if jsonb_array_length(d->'filas') <> 1 then
    raise exception 'FALLA: descarga de movimientos incorrecta: %', d;
  end if;
end;
$$;

-- Validaciones de datos.
do $$
begin
  insert into inventariado.productos (id, negocio_id, nombre, precio_venta)
  values (gen_random_uuid(), current_setting('pruebas.negocio_ana')::uuid, 'Negativo', -1);
  raise exception 'FALLA: se aceptó un precio negativo';
exception when check_violation then
  null;
end;
$$;

do $$
begin
  insert into inventariado.productos (id, negocio_id, nombre, unidad)
  values (gen_random_uuid(), current_setting('pruebas.negocio_ana')::uuid, 'Rara', 'litro');
  raise exception 'FALLA: se aceptó una unidad inválida';
exception when check_violation then
  null;
end;
$$;
reset role;

-- Beto no ve ni puede escribir productos de Ana.
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
do $$
declare
  d jsonb;
begin
  if (select count(*) from inventariado.productos) <> 0 then
    raise exception 'FALLA: Beto ve productos de Ana';
  end if;
  d := inventariado.sincronizar_descarga('productos', current_setting('pruebas.negocio_ana')::uuid);
  if jsonb_array_length(d->'filas') <> 0 then
    raise exception 'FALLA: Beto descargó productos de Ana';
  end if;
end;
$$;

do $$
begin
  insert into inventariado.productos (id, negocio_id, nombre)
  values (gen_random_uuid(), current_setting('pruebas.negocio_ana')::uuid, 'Intruso');
  raise exception 'FALLA: Beto creó un producto en el negocio de Ana';
exception when insufficient_privilege then
  null;
end;
$$;

do $$
begin
  update inventariado.productos set precio_venta = 1 where negocio_id = current_setting('pruebas.negocio_ana')::uuid;
  if exists (select 1 from inventariado.productos where precio_venta = 1) then
    raise exception 'FALLA: Beto modificó precios de Ana';
  end if;
end;
$$;
reset role;

-- Sin sesión no hay acceso.
select pg_temp.como(null);
do $$
begin
  perform count(*) from inventariado.productos;
  raise exception 'FALLA: anon pudo leer productos';
exception when insufficient_privilege then
  null;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', '', false);
\o
\echo 'Todas las pruebas SQL de fase 2 pasaron'
