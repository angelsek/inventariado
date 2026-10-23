-- Prueba gratis de 7 días (antes 14) para los negocios nuevos, igual que lo que se anuncia en
-- grimoriolabs.com. Los negocios que ya tienen suscripción conservan su fecha de término.
-- Se puede ejecutar más de una vez.

create or replace function inventariado.crear_suscripcion_de_prueba()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Durante la prueba se usa el plan Pro, para que se pueda probar todo.
  insert into inventariado.suscripciones (id, negocio_id, plan_id, prueba_hasta)
  values (new.id, new.id, 'pro', now() + interval '7 days')
  on conflict (negocio_id) do nothing;
  return new;
end;
$$;

-- Solo la usa el trigger de negocios: nadie la llama directamente.
revoke execute on function inventariado.crear_suscripcion_de_prueba() from public, anon, authenticated;

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
