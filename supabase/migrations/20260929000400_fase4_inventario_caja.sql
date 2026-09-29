-- Fase 4: proveedores, ingreso de mercadería (compras) y caja.
--
-- Las compras suman stock con movimientos 'compra'; los ajustes y conteos usan
-- los tipos 'ajuste' y 'conteo' que ya existen en movimientos_stock (fase 2).
--
-- Caja: cada teléfono abre y cierra su propia caja. Las ventas quedan ligadas a
-- la caja abierta del teléfono (ventas.caja_id).
--
-- Se puede ejecutar más de una vez sin error.

create table if not exists inventariado.proveedores (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  nombre text not null check (length(trim(nombre)) > 0),
  rut text,
  telefono text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists proveedores_negocio_idx on inventariado.proveedores (negocio_id);

create table if not exists inventariado.compras (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  proveedor_id uuid references inventariado.proveedores (id),
  documento text,
  total integer not null check (total >= 0),
  perfil_id uuid,
  dispositivo_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists compras_negocio_idx on inventariado.compras (negocio_id, creado_en);

create table if not exists inventariado.compra_items (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  compra_id uuid not null references inventariado.compras (id),
  producto_id uuid not null references inventariado.productos (id),
  nombre text not null,
  cantidad numeric not null check (cantidad > 0),
  costo_unitario integer not null check (costo_unitario >= 0),
  total integer not null check (total >= 0),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists compra_items_compra_idx on inventariado.compra_items (compra_id);
create index if not exists compra_items_negocio_idx on inventariado.compra_items (negocio_id);

create table if not exists inventariado.cajas (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  dispositivo_id uuid,
  abierta_por uuid,
  abierta_en timestamptz not null,
  monto_inicial integer not null check (monto_inicial >= 0),
  cerrada_por uuid,
  cerrada_en timestamptz,
  -- Efectivo que debería haber al cerrar (se guarda para que el cierre no cambie
  -- si después se anula una venta) y el que se contó.
  efectivo_esperado integer,
  monto_contado integer check (monto_contado >= 0),
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists cajas_negocio_idx on inventariado.cajas (negocio_id, abierta_en);

create table if not exists inventariado.movimientos_caja (
  id uuid primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  caja_id uuid not null references inventariado.cajas (id),
  tipo text not null check (tipo in ('ingreso', 'retiro')),
  monto integer not null check (monto > 0),
  motivo text,
  perfil_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado boolean not null default false,
  sync_xid xid8 not null default pg_current_xact_id()
);

create index if not exists movimientos_caja_caja_idx on inventariado.movimientos_caja (caja_id);
create index if not exists movimientos_caja_negocio_idx on inventariado.movimientos_caja (negocio_id);

-- Las ventas quedan ligadas a la caja abierta del teléfono.
alter table inventariado.ventas add column if not exists caja_id uuid references inventariado.cajas (id);

-- ---------------------------------------------------------------------------
-- Triggers de sincronización y seguridad (RLS), mismo patrón que antes.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['proveedores', 'compras', 'compra_items', 'cajas', 'movimientos_caja'] loop
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

-- sincronizar_descarga() (fase 1) acepta estas tablas porque tienen sync_xid.

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
