-- Fase 3: ventas, sus ítems y pagos.
--
-- Cada venta guarda una copia del nombre, precio y costo de cada producto al
-- momento de vender, para que los reportes no cambien si después se edita el
-- producto. El stock se descuenta con movimientos 'venta' (ver fase 2) y una
-- anulación los devuelve con movimientos 'anulacion'.
--
-- Se puede ejecutar más de una vez sin error.

create table if not exists inventariado.ventas (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  subtotal integer not null check (subtotal >= 0),
  descuento integer not null default 0 check (descuento >= 0),
  total integer not null check (total >= 0),
  efectivo_recibido integer,
  vuelto integer,
  estado text not null default 'completada' check (estado in ('completada', 'anulada')),
  perfil_id uuid,
  dispositivo_id uuid,
  anulada_en timestamptz,
  anulada_por uuid,
  motivo_anulacion text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists ventas_negocio_fecha_idx on inventariado.ventas (negocio_id, creado_en);

create table if not exists inventariado.venta_items (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  venta_id uuid not null references inventariado.ventas (id),
  -- null para ventas de "monto libre" (productos que no están en el catálogo).
  producto_id uuid references inventariado.productos (id),
  nombre text not null,
  cantidad numeric not null check (cantidad > 0),
  precio_unitario integer not null check (precio_unitario >= 0),
  costo_unitario integer not null default 0 check (costo_unitario >= 0),
  descuento integer not null default 0 check (descuento >= 0),
  total integer not null check (total >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists venta_items_venta_idx on inventariado.venta_items (venta_id);
create index if not exists venta_items_negocio_idx on inventariado.venta_items (negocio_id);

create table if not exists inventariado.pagos (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  venta_id uuid not null references inventariado.ventas (id),
  medio text not null check (medio in ('efectivo', 'debito', 'credito', 'transferencia')),
  monto integer not null check (monto > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists pagos_venta_idx on inventariado.pagos (venta_id);
create index if not exists pagos_negocio_idx on inventariado.pagos (negocio_id);

drop trigger if exists ventas_sync on inventariado.ventas;
create trigger ventas_sync before insert or update on inventariado.ventas
  for each row execute function inventariado.marcar_cambio_sync();
drop trigger if exists venta_items_sync on inventariado.venta_items;
create trigger venta_items_sync before insert or update on inventariado.venta_items
  for each row execute function inventariado.marcar_cambio_sync();
drop trigger if exists pagos_sync on inventariado.pagos;
create trigger pagos_sync before insert or update on inventariado.pagos
  for each row execute function inventariado.marcar_cambio_sync();

-- ---------------------------------------------------------------------------
-- Seguridad (RLS): mismo patrón que las fases anteriores.
-- ---------------------------------------------------------------------------

alter table inventariado.ventas enable row level security;
alter table inventariado.venta_items enable row level security;
alter table inventariado.pagos enable row level security;

drop policy if exists ventas_select on inventariado.ventas;
create policy ventas_select on inventariado.ventas
  for select to authenticated using (inventariado.es_miembro(negocio_id));
drop policy if exists ventas_insert on inventariado.ventas;
create policy ventas_insert on inventariado.ventas
  for insert to authenticated with check (inventariado.es_miembro(negocio_id));
drop policy if exists ventas_update on inventariado.ventas;
create policy ventas_update on inventariado.ventas
  for update to authenticated using (inventariado.es_miembro(negocio_id))
  with check (inventariado.es_miembro(negocio_id));

drop policy if exists venta_items_select on inventariado.venta_items;
create policy venta_items_select on inventariado.venta_items
  for select to authenticated using (inventariado.es_miembro(negocio_id));
drop policy if exists venta_items_insert on inventariado.venta_items;
create policy venta_items_insert on inventariado.venta_items
  for insert to authenticated with check (inventariado.es_miembro(negocio_id));
drop policy if exists venta_items_update on inventariado.venta_items;
create policy venta_items_update on inventariado.venta_items
  for update to authenticated using (inventariado.es_miembro(negocio_id))
  with check (inventariado.es_miembro(negocio_id));

drop policy if exists pagos_select on inventariado.pagos;
create policy pagos_select on inventariado.pagos
  for select to authenticated using (inventariado.es_miembro(negocio_id));
drop policy if exists pagos_insert on inventariado.pagos;
create policy pagos_insert on inventariado.pagos
  for insert to authenticated with check (inventariado.es_miembro(negocio_id));
drop policy if exists pagos_update on inventariado.pagos;
create policy pagos_update on inventariado.pagos
  for update to authenticated using (inventariado.es_miembro(negocio_id))
  with check (inventariado.es_miembro(negocio_id));

grant select, insert, update on inventariado.ventas, inventariado.venta_items,
  inventariado.pagos to authenticated;
grant all on all tables in schema inventariado to service_role;

-- sincronizar_descarga() (fase 1) acepta estas tablas porque tienen sync_xid.

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
