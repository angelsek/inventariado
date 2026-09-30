-- Fase 8: funciones del rubro.
--
--  * Fiado: clientes y sus movimientos (cargo = venta fiada, abono = pago del
--    cliente, anulacion = venta fiada anulada). El saldo es la suma de cargos
--    menos abonos y anulaciones. Las ventas fiadas guardan el cliente.
--  * Envases retornables: precio del envase en el producto.
--  * Packs: un producto puede ser un pack de N unidades de otro; al venderlo se
--    descuenta el stock del producto base.
--  * Promociones por cantidad: "3 x $2.000".
--  * Alcohol: categorías marcadas como alcohol y horario de venta del negocio.
--
-- Las columnas nuevas aceptan NULL para que las versiones anteriores de la app
-- sigan sincronizando sin cambios. Se puede ejecutar más de una vez sin error.

alter table inventariado.productos add column if not exists precio_envase integer
  check (precio_envase >= 0);
alter table inventariado.productos add column if not exists pack_producto_id uuid;
alter table inventariado.productos add column if not exists pack_cantidad numeric
  check (pack_cantidad > 0);
alter table inventariado.productos add column if not exists promo_cantidad integer
  check (promo_cantidad >= 2);
alter table inventariado.productos add column if not exists promo_precio integer
  check (promo_precio >= 0);
alter table inventariado.categorias add column if not exists alcohol boolean;
-- Horario de venta de alcohol ("HH:MM"), según la patente del local.
alter table inventariado.negocios add column if not exists alcohol_desde text
  check (alcohol_desde ~ '^\d{2}:\d{2}$');
alter table inventariado.negocios add column if not exists alcohol_hasta text
  check (alcohol_hasta ~ '^\d{2}:\d{2}$');

-- Nuevo medio de pago: fiado.
alter table inventariado.pagos drop constraint if exists pagos_medio_check;
alter table inventariado.pagos add constraint pagos_medio_check
  check (medio in ('efectivo', 'debito', 'credito', 'transferencia', 'fiado'));

create table if not exists inventariado.clientes (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text,
  -- Deuda máxima permitida; null o 0 = sin límite.
  limite_credito integer check (limite_credito >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists clientes_negocio_idx on inventariado.clientes (negocio_id);

alter table inventariado.ventas add column if not exists cliente_id uuid
  references inventariado.clientes (id);

create table if not exists inventariado.movimientos_cliente (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  cliente_id uuid not null references inventariado.clientes (id),
  tipo text not null check (tipo in ('cargo', 'abono', 'anulacion')),
  monto integer not null check (monto > 0),
  venta_id uuid references inventariado.ventas (id),
  medio text check (medio in ('efectivo', 'debito', 'credito', 'transferencia')),
  notas text,
  perfil_id uuid,
  dispositivo_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists movimientos_cliente_cliente_idx
  on inventariado.movimientos_cliente (cliente_id);
create index if not exists movimientos_cliente_negocio_idx
  on inventariado.movimientos_cliente (negocio_id);

-- Triggers de sincronización y seguridad (RLS), mismo patrón que antes.
do $$
declare
  t text;
begin
  foreach t in array array['clientes', 'movimientos_cliente'] loop
    execute format('drop trigger if exists %1$s_sync on inventariado.%1$I', t);
    execute format(
      'create trigger %1$s_sync before insert or update on inventariado.%1$I
         for each row execute function inventariado.marcar_cambio_sync()', t);

    execute format('alter table inventariado.%I enable row level security', t);

    execute format('drop policy if exists %1$s_select on inventariado.%1$I', t);
    execute format(
      'create policy %1$s_select on inventariado.%1$I for select to authenticated
         using (inventariado.es_miembro(negocio_id))', t);
    execute format('drop policy if exists %1$s_insert on inventariado.%1$I', t);
    execute format(
      'create policy %1$s_insert on inventariado.%1$I for insert to authenticated
         with check (inventariado.es_miembro(negocio_id))', t);
    execute format('drop policy if exists %1$s_update on inventariado.%1$I', t);
    execute format(
      'create policy %1$s_update on inventariado.%1$I for update to authenticated
         using (inventariado.es_miembro(negocio_id)) with check (inventariado.es_miembro(negocio_id))', t);

    execute format('grant select, insert, update on inventariado.%I to authenticated', t);
  end loop;
end;
$$;

grant all on all tables in schema inventariado to service_role;

-- Eliminar la cuenta también borra los clientes y su fiado.
create or replace function inventariado.eliminar_mi_negocio(p_negocio_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from inventariado.negocio_usuarios
     where negocio_id = p_negocio_id and usuario_id = auth.uid() and rol = 'dueno'
  ) then
    raise exception 'Solo el dueño puede eliminar el negocio' using errcode = '42501';
  end if;

  -- En orden, de las tablas que dependen de otras hacia arriba.
  delete from inventariado.movimientos_cliente where negocio_id = p_negocio_id;
  delete from inventariado.pagos where negocio_id = p_negocio_id;
  delete from inventariado.venta_items where negocio_id = p_negocio_id;
  delete from inventariado.ventas where negocio_id = p_negocio_id;
  delete from inventariado.clientes where negocio_id = p_negocio_id;
  delete from inventariado.movimientos_caja where negocio_id = p_negocio_id;
  delete from inventariado.cajas where negocio_id = p_negocio_id;
  delete from inventariado.compra_items where negocio_id = p_negocio_id;
  delete from inventariado.compras where negocio_id = p_negocio_id;
  delete from inventariado.proveedores where negocio_id = p_negocio_id;
  delete from inventariado.movimientos_stock where negocio_id = p_negocio_id;
  delete from inventariado.productos where negocio_id = p_negocio_id;
  delete from inventariado.categorias where negocio_id = p_negocio_id;
  delete from inventariado.perfiles where negocio_id = p_negocio_id;
  delete from inventariado.dispositivos where negocio_id = p_negocio_id;
  delete from inventariado.comentarios where negocio_id = p_negocio_id;
  update inventariado.errores_app set negocio_id = null where negocio_id = p_negocio_id;
  delete from inventariado.pagos_suscripcion where negocio_id = p_negocio_id;
  delete from inventariado.suscripciones where negocio_id = p_negocio_id;
  delete from inventariado.negocio_usuarios where negocio_id = p_negocio_id;
  delete from inventariado.negocios where id = p_negocio_id;
end;
$$;

revoke execute on function inventariado.eliminar_mi_negocio(uuid) from public, anon;
grant execute on function inventariado.eliminar_mi_negocio(uuid) to authenticated;

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
