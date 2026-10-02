-- Eliminación de cuenta y datos desde la app (exigido por Google Play para apps
-- que permiten crear cuentas).
--
-- Borra todos los datos del negocio en el esquema inventariado. La cuenta de
-- Supabase Auth no se borra aquí: el proyecto puede compartirse con otra app
-- que usa la misma cuenta. Al pasar a un proyecto propio, agregar el borrado de
-- auth.users.
--
-- Se puede ejecutar más de una vez sin error.

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
  delete from inventariado.pagos where negocio_id = p_negocio_id;
  delete from inventariado.venta_items where negocio_id = p_negocio_id;
  delete from inventariado.ventas where negocio_id = p_negocio_id;
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
