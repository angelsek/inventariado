-- Imitación mínima de lo que Supabase trae de fábrica, para probar las
-- migraciones en un Postgres local. No se aplica en Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;

-- Tabla de "otra aplicación" en el mismo proyecto, con un nombre que también
-- usa Inventariado. La migración no debe tocarla (ver 10_pruebas_fase1.sql).
create table public.perfiles (id int primary key, apodo text);
insert into public.perfiles values (1, 'otra app');
