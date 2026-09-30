-- Suscripción pagada con Google Play (cobro automático con la tarjeta de la cuenta de Google).
--
-- La app compra la suscripción con Google Play Billing. Una función de Supabase
-- (supabase/functions/verificar-compra-play) confirma la compra con la API de
-- Google y llama a aplicar_compra_play(), que deja la suscripción del negocio
-- "pagada hasta" la fecha que informa Google. Las renovaciones, cancelaciones y
-- pagos fallidos llegan a supabase/functions/notificaciones-play y se aplican igual.
--
-- Se puede ejecutar más de una vez sin error.

-- Precio del plan Pro acordado para Play.
update inventariado.planes set precio_mensual = 14990 where id = 'pro';

create table if not exists inventariado.compras_play (
  -- Token de compra de Google: identifica la suscripción (cambia al cambiar de plan).
  purchase_token text primary key,
  negocio_id uuid not null references inventariado.negocios (id),
  producto_id text not null,
  plan_id text not null references inventariado.planes (id),
  -- Estado según Google: SUBSCRIPTION_STATE_ACTIVE, _CANCELED, _EXPIRED, etc.
  estado text not null,
  expira_en timestamptz,
  auto_renueva boolean not null default false,
  -- Cuenta de Supabase que hizo la compra (null si llegó por notificación de Google).
  usuario_id uuid,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists compras_play_negocio_idx on inventariado.compras_play (negocio_id);

-- Solo la leen los miembros del negocio; escribe únicamente el servidor.
alter table inventariado.compras_play enable row level security;
drop policy if exists compras_play_select on inventariado.compras_play;
create policy compras_play_select on inventariado.compras_play for select to authenticated
  using (inventariado.es_miembro(negocio_id));
grant select on inventariado.compras_play to authenticated;
grant all on inventariado.compras_play to service_role;

-- Guarda lo que informó Google y actualiza la suscripción del negocio.
-- p_vigente = false para compras pendientes o reemplazadas (no dan acceso).
create or replace function inventariado.aplicar_compra_play(
  p_token text,
  p_negocio_id uuid,
  p_producto_id text,
  p_plan_id text,
  p_estado text,
  p_expira_en timestamptz,
  p_auto_renueva boolean,
  p_usuario_id uuid,
  p_vigente boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into inventariado.compras_play (purchase_token, negocio_id, producto_id, plan_id, estado,
    expira_en, auto_renueva, usuario_id)
  values (p_token, p_negocio_id, p_producto_id, p_plan_id, p_estado, p_expira_en, p_auto_renueva,
    p_usuario_id)
  on conflict (purchase_token) do update
    set producto_id = excluded.producto_id,
        plan_id = excluded.plan_id,
        estado = excluded.estado,
        expira_en = excluded.expira_en,
        auto_renueva = excluded.auto_renueva,
        usuario_id = coalesce(inventariado.compras_play.usuario_id, excluded.usuario_id),
        actualizado_en = now();

  if not p_vigente or p_expira_en is null then
    return;
  end if;

  -- Google manda: lo pagado llega hasta donde dice Google (incluida la prueba de
  -- 14 días, que Google cobra solo al terminar). Si se cancela, vence en esa fecha.
  update inventariado.suscripciones
     set plan_id = p_plan_id,
         pagado_hasta = p_expira_en,
         actualizado_en = now()
   where negocio_id = p_negocio_id;
end;
$$;

revoke execute on function inventariado.aplicar_compra_play(text, uuid, text, text, text,
  timestamptz, boolean, uuid, boolean) from public, anon, authenticated;
grant execute on function inventariado.aplicar_compra_play(text, uuid, text, text, text,
  timestamptz, boolean, uuid, boolean) to service_role;

-- Eliminar la cuenta también borra las compras registradas.
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
  delete from inventariado.compras_play where negocio_id = p_negocio_id;
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
