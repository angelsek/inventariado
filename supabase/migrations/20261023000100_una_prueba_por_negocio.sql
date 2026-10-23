-- Una sola prueba gratis de 7 días por negocio real.
--
-- Hasta ahora cada fila nueva de inventariado.negocios recibía 7 días de prueba, sin tope: con
-- otro correo se empezaba una prueba nueva cuantas veces se quisiera. Ahora la prueba se
-- "consume" y queda anotada en inventariado.pruebas_usadas con tres llaves, todas del mismo
-- peso: el equipo (el id derivado del ANDROID_ID), el correo de la cuenta y el RUT del negocio.
-- Si cualquiera de las tres ya usó su prueba, el negocio nuevo nace sin prueba y la app lo trata
-- como suspendido (solo lectura), con una pantalla que lo explica y lleva a contratar.
--
-- Quien borra su negocio y lo vuelve a crear recibe los días que le quedaban de la prueba
-- original, no 7 nuevos: así el que se equivocó al crear la cuenta se arregla solo.
--
-- No se guarda ni el correo ni el RUT ni el id del equipo: solo una huella SHA-256 con prefijo
-- de dominio, que no permite recuperar el dato. La tabla no tiene negocio_id a propósito, para
-- que sobreviva a eliminar_mi_negocio() sin dejar rastro de a quién pertenecía (ver la política
-- de privacidad, que declara esta huella).
--
-- Ojo: el id del equipo lo envía el cliente, así que esto es una barrera de producto, no una
-- frontera de seguridad (igual que "exportar solo con plan pagado", ver docs/PERMISOS.md). Un
-- teléfono nuevo, un restablecimiento de fábrica o la versión web (donde el id del equipo es al
-- azar) se siguen escapando. Detalle en docs/PRUEBA_GRATIS.md.
--
-- Se puede ejecutar más de una vez sin error.

-- ---------------------------------------------------------------------------
-- Registro de pruebas ya usadas
-- ---------------------------------------------------------------------------

create table if not exists inventariado.pruebas_usadas (
  llave_hash text primary key,
  tipo text not null check (tipo in ('correo', 'rut', 'equipo')),
  -- Fecha en que terminaba la prueba original: quien vuelve recibe lo que le quedaba.
  prueba_hasta timestamptz not null,
  creado_en timestamptz not null default now()
);

-- Nadie la lee ni la escribe desde la app: solo las funciones de abajo (security definer).
-- Sin sync_xid, así que sincronizar_descarga() la rechaza por diseño.
alter table inventariado.pruebas_usadas enable row level security;
revoke all on inventariado.pruebas_usadas from anon, authenticated;
grant all on inventariado.pruebas_usadas to service_role;

-- ---------------------------------------------------------------------------
-- Normalización y huella de las llaves
-- ---------------------------------------------------------------------------

-- Deja el correo comparable: minúsculas, sin la etiqueta "+algo" y, en Gmail, sin los puntos
-- (gmail los ignora, así que ana.perez@gmail.com y anaperez@gmail.com son la misma casilla).
create or replace function inventariado.normalizar_correo(p_correo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_local text;
  v_dominio text;
begin
  if v_correo = '' or position('@' in v_correo) = 0 then
    return nullif(v_correo, '');
  end if;
  v_local := split_part(v_correo, '@', 1);
  v_dominio := split_part(v_correo, '@', 2);
  v_local := split_part(v_local, '+', 1);
  if v_dominio in ('gmail.com', 'googlemail.com') then
    v_local := replace(v_local, '.', '');
    v_dominio := 'gmail.com';
  end if;
  if v_local = '' or v_dominio = '' then
    return null;
  end if;
  return v_local || '@' || v_dominio;
end;
$$;

-- "12.345.678-5" y "123456785" son el mismo RUT. Devuelve null si no tiene forma de RUT
-- (el dígito verificador lo valida la app, ver src/lib/validacion.ts).
create or replace function inventariado.normalizar_rut(p_rut text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rut text := upper(regexp_replace(coalesce(p_rut, ''), '[^0-9kK]', '', 'g'));
begin
  if v_rut ~ '^[0-9]{7,8}[0-9K]$' then
    return v_rut;
  end if;
  return null;
end;
$$;

-- Huella irreversible de una llave. El prefijo con el tipo evita que un RUT y un id de equipo
-- con el mismo texto choquen entre sí.
create or replace function inventariado.huella_prueba(p_tipo text, p_valor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_valor is null or p_valor = '' then null
    else encode(sha256(convert_to('stockeao-prueba:' || p_tipo || ':' || p_valor, 'UTF8')), 'hex')
  end;
$$;

-- Las llaves de un negocio, ya normalizadas y con huella. Las que vienen vacías no se usan
-- (el RUT es opcional, y en la versión web el id del equipo puede no llegar).
create or replace function inventariado.llaves_de_prueba(
  p_correo text,
  p_rut text,
  p_equipo_id uuid
)
returns table (tipo text, llave_hash text)
language sql
immutable
set search_path = ''
as $$
  select t.tipo, inventariado.huella_prueba(t.tipo, t.valor)
    from (values
      ('correo', inventariado.normalizar_correo(p_correo)),
      ('rut', inventariado.normalizar_rut(p_rut)),
      ('equipo', p_equipo_id::text)
    ) as t (tipo, valor)
   where t.valor is not null and t.valor <> '';
$$;

-- ---------------------------------------------------------------------------
-- Consumir la prueba
-- ---------------------------------------------------------------------------

-- Devuelve hasta cuándo dura la prueba del negocio nuevo, y deja anotadas sus llaves:
--   * ninguna llave conocida  -> 7 días desde ahora (la prueba de siempre);
--   * alguna llave conocida   -> la fecha más temprana ya registrada (lo que quedaba);
--   * esa fecha ya pasó       -> null, o sea: sin prueba.
create or replace function inventariado.consumir_prueba(
  p_correo text,
  p_rut text,
  p_equipo_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Fecha ya anotada para alguna de las llaves, o null si ninguna había usado su prueba.
  v_conocida timestamptz;
  v_hasta timestamptz;
  v_llave text;
begin
  -- Dos cuentas creadas al mismo tiempo con la misma llave no se ven entre sí (cada una lee
  -- antes de que la otra escriba) y las dos recibirían 7 días. El cerrojo de transacción las
  -- pone en fila. Se toman uno por uno y en orden de llave: si se pidieran dentro de un select,
  -- el planificador podría evaluarlos antes de ordenar, y dos transacciones con llaves en común
  -- se trabarían entre ellas. Se sueltan solos al terminar la transacción.
  for v_llave in
    select k.llave_hash from inventariado.llaves_de_prueba(p_correo, p_rut, p_equipo_id) k
     order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_llave, 0));
  end loop;

  select min(u.prueba_hasta) into v_conocida
    from inventariado.llaves_de_prueba(p_correo, p_rut, p_equipo_id) k
    join inventariado.pruebas_usadas u on u.llave_hash = k.llave_hash;

  v_hasta := coalesce(v_conocida, now() + interval '7 days');

  -- El RUT es el único dato que el cliente escribe libremente y que identifica a un tercero:
  -- quien quisiera hacer daño podría crear negocios con el RUT de otro para dejarlo sin prueba
  -- antes de que se registre. Por eso la llave del RUT solo se anota cuando esta es una prueba
  -- nueva de verdad (ninguna llave conocida); el correo y el equipo, que son de la cuenta que
  -- está creando el negocio, se anotan siempre. Así quemar un RUT ajeno cuesta una cuenta nueva
  -- por cada uno, y el negocio afectado se arregla con admin_liberar_prueba().
  insert into inventariado.pruebas_usadas (llave_hash, tipo, prueba_hasta)
  select k.llave_hash, k.tipo, v_hasta
    from inventariado.llaves_de_prueba(p_correo, p_rut, p_equipo_id) k
   where k.tipo <> 'rut' or v_conocida is null
  on conflict (llave_hash) do nothing;

  return case when v_hasta > now() then v_hasta else null end;
end;
$$;

-- El trigger de siempre, ahora pasando por consumir_prueba(). Sigue siendo el único lugar que
-- crea la suscripción: así un negocio creado por service_role tampoco se queda sin fila.
create or replace function inventariado.crear_suscripcion_de_prueba()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correo text;
  v_equipo uuid;
begin
  select u.email into v_correo from auth.users u where u.id = auth.uid();
  -- crear_negocio() deja aquí el id del equipo (ajuste de transacción, como el que usa
  -- proteger_dispositivos()). Si la app es vieja y no lo manda, se limita por correo y RUT.
  v_equipo := nullif(current_setting('inventariado.equipo_prueba', true), '')::uuid;
  -- Se limpia al leerlo: si en la misma transacción se insertara otro negocio sin pasar por
  -- crear_negocio() (por ejemplo desde service_role), no heredaría este equipo.
  perform set_config('inventariado.equipo_prueba', '', true);

  -- Durante la prueba se usa el plan Pro, para que se pueda probar todo.
  insert into inventariado.suscripciones (id, negocio_id, plan_id, prueba_hasta)
  values (new.id, new.id, 'pro', inventariado.consumir_prueba(v_correo, new.rut, v_equipo))
  on conflict (negocio_id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- crear_negocio() recibe el id del equipo
-- ---------------------------------------------------------------------------

-- La firma vieja se borra para que la llamada no quede ambigua (mismo patrón que usó
-- 20261018000100 con registrar_dispositivo). Los APK ya instalados llaman con 6 argumentos
-- nombrados y siguen funcionando: su negocio se limita solo por correo y RUT.
drop function if exists inventariado.crear_negocio(text, text, text, uuid, text, text);

create or replace function inventariado.crear_negocio(
  p_nombre text,
  p_rut text,
  p_direccion text,
  p_perfil_id uuid,
  p_nombre_dueno text,
  p_pin_hash text,
  p_equipo_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_negocio uuid;
begin
  if v_usuario is null then
    raise exception 'Debes iniciar sesión' using errcode = '28000';
  end if;

  if exists (select 1 from inventariado.negocio_usuarios where usuario_id = v_usuario) then
    raise exception 'Esta cuenta ya tiene un negocio' using errcode = '23505';
  end if;

  -- Lo lee el trigger de la suscripción, que corre dentro del insert de abajo.
  perform set_config('inventariado.equipo_prueba', coalesce(p_equipo_id::text, ''), true);

  insert into inventariado.negocios (nombre, rut, direccion)
  values (trim(p_nombre), nullif(trim(p_rut), ''), nullif(trim(p_direccion), ''))
  returning id into v_negocio;

  insert into inventariado.negocio_usuarios (negocio_id, usuario_id, rol)
  values (v_negocio, v_usuario, 'dueno');

  insert into inventariado.perfiles (id, negocio_id, nombre, rol, pin_hash)
  values (p_perfil_id, v_negocio, trim(p_nombre_dueno), 'dueno', p_pin_hash);

  return v_negocio;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administración
-- ---------------------------------------------------------------------------

-- Las llaves de un negocio que ya existe, sacadas del servidor (no de lo que mande la app): el
-- correo de sus cuentas, su RUT y su primer equipo, el que lo creó. Los equipos vinculados
-- después no van: el teléfono de un empleado no gastó ninguna prueba y no debe quedar anotado
-- al liberar, ni contar para decidir si el negocio está bloqueado.
create or replace function inventariado.llaves_del_negocio(p_negocio_id uuid)
returns table (tipo text, llave_hash text)
language sql
stable
security definer
set search_path = ''
as $$
  select k.tipo, k.llave_hash
    from inventariado.negocios n
    left join inventariado.negocio_usuarios nu on nu.negocio_id = n.id
    left join auth.users u on u.id = nu.usuario_id
    cross join lateral inventariado.llaves_de_prueba(u.email, n.rut, null) k
   where n.id = p_negocio_id
  union
  select k.tipo, k.llave_hash
    from inventariado.llaves_de_prueba(null, null, (
      select d.id from inventariado.dispositivos d
       where d.negocio_id = p_negocio_id
       order by d.creado_en limit 1)) k;
$$;

-- ¿Este negocio nació sin prueba porque alguna de sus llaves ya la había usado?
-- Es lo que el panel de administración muestra como "Sin prueba (bloqueada)".
create or replace function inventariado.prueba_bloqueada(p_negocio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from inventariado.suscripciones s
     where s.negocio_id = p_negocio_id and s.prueba_hasta is null
  ) and exists (
    select 1 from inventariado.llaves_del_negocio(p_negocio_id) k
      join inventariado.pruebas_usadas u on u.llave_hash = k.llave_hash
  );
$$;

-- Devuelve la prueba a un negocio legítimo (cambió de teléfono, se equivocó al crear la cuenta,
-- o se le quiere dar otra oportunidad): olvida lo anotado para sus llaves y le da p_dias de
-- prueba. Las llaves quedan anotadas con la fecha nueva, así que sigue siendo una sola prueba.
create or replace function inventariado.admin_liberar_prueba(
  p_negocio_id uuid,
  p_dias integer default 7
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hasta timestamptz;
begin
  perform inventariado.exigir_admin();
  if p_dias is null or p_dias < 1 or p_dias > 365 then
    raise exception 'Días de prueba no válidos' using errcode = '22023';
  end if;
  v_hasta := now() + make_interval(days => p_dias);

  insert into inventariado.pruebas_usadas (llave_hash, tipo, prueba_hasta)
  select k.llave_hash, k.tipo, v_hasta
    from inventariado.llaves_del_negocio(p_negocio_id) k
  on conflict (llave_hash) do update set prueba_hasta = excluded.prueba_hasta;

  -- No toca "suspendida": si el administrador suspendió el negocio a propósito, devolverle la
  -- prueba no debería reactivarlo en silencio (para eso está «Quitar suspensión»).
  update inventariado.suscripciones
     set prueba_hasta = v_hasta
   where negocio_id = p_negocio_id;
  if not found then
    raise exception 'Negocio sin suscripción' using errcode = 'P0002';
  end if;

  return v_hasta;
end;
$$;

-- Misma lista de antes, más "prueba_bloqueada" para que se vea por qué un negocio nació
-- suspendido y se pueda liberar desde la app.
create or replace function inventariado.admin_listar_negocios()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform inventariado.exigir_admin();
  return coalesce((
    select jsonb_agg(fila order by fila->>'nombre')
      from (
        select jsonb_build_object(
          'id', n.id,
          'nombre', n.nombre,
          'rut', n.rut,
          'creado_en', n.creado_en,
          'correo', (select u.email from inventariado.negocio_usuarios nu
                       join auth.users u on u.id = nu.usuario_id
                      where nu.negocio_id = n.id limit 1),
          'plan_id', s.plan_id,
          'estado', inventariado.estado_suscripcion(s),
          'prueba_hasta', s.prueba_hasta,
          'pagado_hasta', s.pagado_hasta,
          'suspendida', s.suspendida,
          'prueba_bloqueada', inventariado.prueba_bloqueada(n.id),
          'notas', s.notas,
          'dispositivos', (select count(*) from inventariado.dispositivos d
                            where d.negocio_id = n.id and not d.eliminado),
          'ultimo_sync', (select max(d.ultimo_sync) from inventariado.dispositivos d
                           where d.negocio_id = n.id)
        ) as fila
          from inventariado.negocios n
          join inventariado.suscripciones s on s.negocio_id = n.id
         where not n.eliminado
      ) t), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Los negocios que ya existen también gastan su prueba
-- ---------------------------------------------------------------------------

-- Sin esto, cualquier negocio de hoy podría borrarse y empezar una prueba más. Se anota con la
-- fecha de su prueba actual; los que nunca tuvieron prueba (por ejemplo los de Google Play, donde
-- la prueba la da Google) no se anotan. Se puede repetir: no pisa lo ya registrado.
-- Arreglos que corren una sola vez, aunque el archivo se vuelva a ejecutar. Las migraciones de
-- este proyecto se ejecutan a mano y se repiten a menudo, y un arreglo sobre los datos no siempre
-- se puede repetir sin hacer daño.
create table if not exists inventariado.arreglos_aplicados (
  clave text primary key,
  creado_en timestamptz not null default now()
);
alter table inventariado.arreglos_aplicados enable row level security;
revoke all on inventariado.arreglos_aplicados from anon, authenticated;
grant all on inventariado.arreglos_aplicados to service_role;

-- La primera versión de este archivo, que alcanzó a ejecutarse en Supabase, anotaba todos los
-- equipos vinculados a cada negocio y no solo el que lo creó: así, el empleado que alguna vez
-- vinculó su teléfono al negocio de su jefe se quedaba sin prueba propia. Se borran esas llaves
-- de más, una sola vez: repetirlo borraría la llave legítima del empleado que después abrió su
-- propio negocio con ese mismo teléfono (su equipo sigue figurando en el negocio del jefe, porque
-- el servidor no deja moverlo). Las llaves de negocios ya eliminados no se tocan: son justo las
-- que cierran el ciclo.
do $$
begin
  if exists (select 1 from inventariado.arreglos_aplicados where clave = 'equipos-de-mas-v1') then
    return;
  end if;
  delete from inventariado.pruebas_usadas u
   where u.tipo = 'equipo'
     and exists (
       select 1 from inventariado.dispositivos d
        where inventariado.huella_prueba('equipo', d.id::text) = u.llave_hash
          and d.id <> (select d2.id from inventariado.dispositivos d2
                        where d2.negocio_id = d.negocio_id
                        order by d2.creado_en limit 1)
     );
  insert into inventariado.arreglos_aplicados (clave) values ('equipos-de-mas-v1');
end;
$$;

-- llaves_del_negocio() ya deja fuera los equipos vinculados después del primero.
-- El group by junta la misma llave en dos negocios (por ejemplo el mismo RUT) y se queda con la
-- prueba más temprana. El tipo queda determinado por la llave, así que min() da siempre el mismo.
insert into inventariado.pruebas_usadas (llave_hash, tipo, prueba_hasta)
select k.llave_hash, min(k.tipo), min(s.prueba_hasta)
  from inventariado.suscripciones s
  cross join lateral inventariado.llaves_del_negocio(s.negocio_id) k
 where s.prueba_hasta is not null
 group by k.llave_hash
on conflict (llave_hash) do nothing;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'inventariado.crear_negocio(text, text, text, uuid, text, text, uuid)',
    'inventariado.admin_listar_negocios()',
    'inventariado.admin_liberar_prueba(uuid, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Internas: solo las usan el trigger y las funciones de administración.
  foreach f in array array[
    'inventariado.crear_suscripcion_de_prueba()',
    'inventariado.consumir_prueba(text, text, uuid)',
    'inventariado.llaves_de_prueba(text, text, uuid)',
    'inventariado.llaves_del_negocio(uuid)',
    'inventariado.huella_prueba(text, text)',
    'inventariado.normalizar_correo(text)',
    'inventariado.normalizar_rut(text)',
    'inventariado.prueba_bloqueada(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
