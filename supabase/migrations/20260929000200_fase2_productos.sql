-- Fase 2: categorías, productos y movimientos de stock.
--
-- El stock de un producto no se guarda como número: es la suma de sus
-- movimientos (inicial, venta, compra, ajuste...). Los movimientos solo se
-- agregan, nunca se editan, para que varios teléfonos no se pisen.
--
-- No hay restricción de código de barras único en el servidor: dos teléfonos
-- sin conexión podrían crear el mismo código y la sincronización quedaría
-- trabada. La app avisa de duplicados localmente.
--
-- Se puede ejecutar más de una vez sin error.

create table if not exists inventariado.categorias (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  nombre text not null check (length(trim(nombre)) > 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists categorias_negocio_idx on inventariado.categorias (negocio_id);

create table if not exists inventariado.productos (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  nombre text not null check (length(trim(nombre)) > 0),
  codigo_barras text,
  categoria_id uuid references inventariado.categorias (id),
  precio_venta integer not null default 0 check (precio_venta >= 0),
  costo integer not null default 0 check (costo >= 0),
  stock_minimo numeric not null default 0 check (stock_minimo >= 0),
  unidad text not null default 'unidad' check (unidad in ('unidad', 'pack', 'kg')),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists productos_negocio_idx on inventariado.productos (negocio_id);
create index if not exists productos_codigo_idx on inventariado.productos (negocio_id, codigo_barras);

create table if not exists inventariado.movimientos_stock (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  producto_id uuid not null references inventariado.productos (id),
  tipo text not null check (tipo in ('inicial', 'venta', 'compra', 'ajuste', 'anulacion', 'conteo')),
  -- Positivo suma stock, negativo resta.
  cantidad numeric not null,
  motivo text,
  referencia_id uuid,
  perfil_id uuid,
  dispositivo_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists movimientos_negocio_idx on inventariado.movimientos_stock (negocio_id);
create index if not exists movimientos_producto_idx on inventariado.movimientos_stock (producto_id);

drop trigger if exists categorias_sync on inventariado.categorias;
create trigger categorias_sync before insert or update on inventariado.categorias
  for each row execute function inventariado.marcar_cambio_sync();
drop trigger if exists productos_sync on inventariado.productos;
create trigger productos_sync before insert or update on inventariado.productos
  for each row execute function inventariado.marcar_cambio_sync();
drop trigger if exists movimientos_stock_sync on inventariado.movimientos_stock;
create trigger movimientos_stock_sync before insert or update on inventariado.movimientos_stock
  for each row execute function inventariado.marcar_cambio_sync();

-- ---------------------------------------------------------------------------
-- Seguridad (RLS): mismo patrón que fase 1.
-- ---------------------------------------------------------------------------

alter table inventariado.categorias enable row level security;
alter table inventariado.productos enable row level security;
alter table inventariado.movimientos_stock enable row level security;

drop policy if exists categorias_select on inventariado.categorias;
create policy categorias_select on inventariado.categorias
  for select to authenticated using (inventariado.es_miembro(negocio_id));
drop policy if exists categorias_insert on inventariado.categorias;
create policy categorias_insert on inventariado.categorias
  for insert to authenticated with check (inventariado.es_miembro(negocio_id));
drop policy if exists categorias_update on inventariado.categorias;
create policy categorias_update on inventariado.categorias
  for update to authenticated using (inventariado.es_miembro(negocio_id))
  with check (inventariado.es_miembro(negocio_id));

drop policy if exists productos_select on inventariado.productos;
create policy productos_select on inventariado.productos
  for select to authenticated using (inventariado.es_miembro(negocio_id));
drop policy if exists productos_insert on inventariado.productos;
create policy productos_insert on inventariado.productos
  for insert to authenticated with check (inventariado.es_miembro(negocio_id));
drop policy if exists productos_update on inventariado.productos;
create policy productos_update on inventariado.productos
  for update to authenticated using (inventariado.es_miembro(negocio_id))
  with check (inventariado.es_miembro(negocio_id));

-- La política de update existe porque un reintento de subida hace upsert; la
-- app nunca modifica un movimiento existente.
drop policy if exists movimientos_select on inventariado.movimientos_stock;
create policy movimientos_select on inventariado.movimientos_stock
  for select to authenticated using (inventariado.es_miembro(negocio_id));
drop policy if exists movimientos_insert on inventariado.movimientos_stock;
create policy movimientos_insert on inventariado.movimientos_stock
  for insert to authenticated with check (inventariado.es_miembro(negocio_id));
drop policy if exists movimientos_update on inventariado.movimientos_stock;
create policy movimientos_update on inventariado.movimientos_stock
  for update to authenticated using (inventariado.es_miembro(negocio_id))
  with check (inventariado.es_miembro(negocio_id));

grant select, insert, update on inventariado.categorias, inventariado.productos,
  inventariado.movimientos_stock to authenticated;
grant all on all tables in schema inventariado to service_role;

-- sincronizar_descarga() (fase 1) acepta estas tablas porque tienen sync_xid.

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
