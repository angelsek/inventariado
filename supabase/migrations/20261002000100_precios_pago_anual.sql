-- Precios de lanzamiento y pago anual (12 meses por el precio de 10).
--
-- Básico $9.990 al mes o $99.900 al año; Pro $14.990 al mes o $149.900 al año.
-- El pago anual se registra como siempre desde el panel de administración (12 meses).
--
-- Se puede ejecutar más de una vez sin error.

update inventariado.planes set precio_mensual = 14990 where id = 'pro';

alter table inventariado.planes
  add column if not exists precio_anual integer check (precio_anual >= 0);

-- Solo se completa si está vacío: si después se ajusta a mano, volver a ejecutar no lo pisa.
update inventariado.planes set precio_anual = precio_mensual * 10 where precio_anual is null;
