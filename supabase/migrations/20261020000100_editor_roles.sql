-- Editor de roles: el dueño (o quien tenga el permiso "usuarios") crea, renombra, cambia
-- y elimina roles desde la app. Los equipos trabajan sin internet, así que dos cambios
-- pueden chocar al sincronizar. Un error aquí dejaría al equipo sin sincronizar para
-- siempre (sube roles antes que perfiles y se detiene en el primer error), por eso los
-- choques se resuelven solos:
--   * Dos roles con el mismo nombre: el que llega después pasa a llamarse "Nombre (2)".
--   * Eliminar un rol que otro equipo ya le asignó a alguien: el rol sigue vigente y
--     vuelve a aparecer en el equipo que lo eliminó.
--   * Asignar un rol que otro equipo ya eliminó: la persona conserva el rol que tenía
--     o queda como Cajero.
-- Requiere 20261019000100_roles_permisos.sql. Se puede ejecutar más de una vez sin error.

-- Primer nombre libre del negocio para un rol: "Nombre", "Nombre (2)", "Nombre (3)"...
-- recortando la base para no pasar de 40 letras. security invoker: la llama el trigger
-- como quien guarda el rol, que es miembro del negocio y ve sus roles.
create or replace function inventariado.nombre_rol_libre(
  p_negocio_id uuid, p_rol_id uuid, p_nombre text
)
returns text
language plpgsql
-- Volátil a propósito: debe ver las filas que el mismo comando acaba de escribir.
security invoker
set search_path = ''
as $$
declare
  v_base text := trim(p_nombre);
  v_nombre text := v_base;
  v_sufijo text;
  v_n int := 1;
begin
  while exists (
    select 1 from inventariado.roles
     where negocio_id = p_negocio_id and id <> p_rol_id and not eliminado
       and lower(trim(nombre)) = lower(v_nombre)
  ) loop
    v_n := v_n + 1;
    v_sufijo := ' (' || v_n || ')';
    v_nombre := rtrim(left(v_base, 40 - length(v_sufijo))) || v_sufijo;
  end loop;
  return v_nombre;
end;
$$;

-- security invoker (a propósito): current_user es quien inserta. Dentro de
-- crear_roles_predefinidos() (security definer) es el dueño de esa función.
create or replace function inventariado.proteger_roles()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Los predefinidos los crea solo crear_roles_predefinidos().
    -- Un upsert de un rol que ya existe también pasa por aquí: solo se revisa si es nuevo.
    if new.predefinido is not null and current_user in ('authenticated', 'anon')
       and not exists (select 1 from inventariado.roles where id = new.id) then
      raise exception 'Los roles predefinidos los crea el sistema' using errcode = '42501';
    end if;
  else
    if new.negocio_id <> old.negocio_id then
      raise exception 'Un rol no se puede mover a otro negocio' using errcode = '42501';
    end if;
    if new.predefinido is distinct from old.predefinido then
      raise exception 'No se puede cambiar si un rol es predefinido' using errcode = '42501';
    end if;
    if new.eliminado and not old.eliminado and old.predefinido is not null then
      raise exception 'Los roles predefinidos no se pueden eliminar' using errcode = '42501';
    end if;
    -- Otro equipo ya le asignó el rol a alguien: no se elimina (no es error, para no
    -- trabar la sincronización); el rol vuelve a aparecer en el equipo que lo eliminó.
    if new.eliminado and not old.eliminado and exists (
      select 1 from inventariado.perfiles where rol_id = new.id and not eliminado
    ) then
      new.eliminado := false;
    end if;
  end if;

  -- Nombre repetido (dos equipos sin internet crearon "Reponedor"): se numera.
  if not new.eliminado and (
    tg_op = 'INSERT' or old.eliminado or lower(trim(new.nombre)) <> lower(trim(old.nombre))
  ) then
    new.nombre := inventariado.nombre_rol_libre(new.negocio_id, new.id, new.nombre);
  end if;
  return new;
end;
$$;

-- security definer: revisa roles y perfiles del negocio sin pasar por la RLS.
-- Igual que en 20261019000100_roles_permisos.sql, salvo que un rol eliminado del mismo
-- negocio ya no es error: se trata como si la persona llegara sin rol.
create or replace function inventariado.proteger_perfiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.negocio_id <> old.negocio_id then
      raise exception 'Un perfil no se puede mover a otro negocio' using errcode = '42501';
    end if;
    if old.rol = 'dueno' and (new.rol <> 'dueno' or not new.activo or new.eliminado) then
      raise exception 'El perfil del dueño no se puede cambiar de rol, desactivar ni eliminar'
        using errcode = '42501';
    end if;
    if old.rol <> 'dueno' and new.rol = 'dueno' then
      raise exception 'Solo puede haber un dueño' using errcode = '42501';
    end if;
  elsif new.rol = 'dueno' and exists (
    -- El upsert del propio dueño (mismo id) pasa por aquí antes de convertirse en update.
    select 1 from inventariado.perfiles
     where negocio_id = new.negocio_id and rol = 'dueno' and id <> new.id
  ) then
    raise exception 'Solo puede haber un dueño' using errcode = '42501';
  end if;

  if new.rol = 'dueno' then
    new.rol_id := null;
    return new;
  end if;

  if new.rol_id is not null then
    if not exists (
      select 1 from inventariado.roles where id = new.rol_id and negocio_id = new.negocio_id
    ) then
      raise exception 'El rol no es de este negocio' using errcode = '23503';
    end if;
    -- Otro equipo eliminó el rol mientras este lo asignaba sin internet. Quien ya lo
    -- tenía puede seguir guardándose; si no, se sigue como si llegara sin rol.
    if exists (
      select 1 from inventariado.roles where id = new.rol_id and eliminado
    ) and not (tg_op = 'UPDATE' and new.rol_id = old.rol_id) then
      new.rol_id := null;
      -- En un UPDATE se conserva el rol anterior; en un INSERT (también el de un upsert)
      -- se busca abajo el que ya tiene la persona.
      if tg_op = 'UPDATE' then
        new.rol_id := old.rol_id;
      end if;
    end if;
  end if;

  if new.rol_id is null then
    -- Llega sin rol (APK sin roles o equipo que aún no los descarga). En un upsert de una
    -- persona que ya existe, este BEFORE INSERT corre antes del update y su valor pasa a
    -- EXCLUDED: se conserva el rol que ya tiene para no degradarla. Si no tiene, Cajero.
    select rol_id into new.rol_id from inventariado.perfiles
     where id = new.id and negocio_id = new.negocio_id;
    if new.rol_id is null then
      select id into new.rol_id from inventariado.roles
       where negocio_id = new.negocio_id and predefinido = 'cajero';
    end if;
  end if;

  return new;
end;
$$;

-- Avisa a la API de Supabase que recargue tablas y funciones.
notify pgrst, 'reload schema';
