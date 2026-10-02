-- Pruebas de precios y pago anual.
\set ON_ERROR_STOP on
\o /dev/null

do $$
begin
  if (select precio_mensual from inventariado.planes where id = 'pro') <> 14990 then
    raise exception 'FALLA: el plan Pro no quedó en $14.990';
  end if;
  if (select precio_anual from inventariado.planes where id = 'basico') <> 99900 then
    raise exception 'FALLA: el pago anual del Básico no es $99.900';
  end if;
  if (select precio_anual from inventariado.planes where id = 'pro') <> 149900 then
    raise exception 'FALLA: el pago anual del Pro no es $149.900';
  end if;
end;
$$;

-- Las cuentas con sesión ven los precios anuales (pantalla Suscripción).
set role authenticated;
do $$
begin
  if (select count(*) from inventariado.planes where precio_anual is not null) < 2 then
    raise exception 'FALLA: los precios anuales no son visibles';
  end if;
end;
$$;
reset role;
