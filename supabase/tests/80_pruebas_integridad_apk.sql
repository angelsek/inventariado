-- Pruebas de integridad del APK: SHA-256 en versiones_app.
\set ON_ERROR_STOP on
\o /dev/null

do $$
declare
  hash constant text := repeat('ab', 32);
begin
  -- Una versión con hash válido: ultima_version() lo devuelve tal cual.
  insert into inventariado.versiones_app (version_code, version, url, sha256)
  values (900001, '9.9.9', 'https://github.com/angelsek/inventariado/releases/download/apk-900001/stockeao.apk', hash);
  if inventariado.ultima_version()->>'sha256' is distinct from hash then
    raise exception 'FALLA: ultima_version() no devuelve el sha256';
  end if;

  -- Formatos inválidos: mayúsculas, largo distinto o texto cualquiera.
  begin
    insert into inventariado.versiones_app (version_code, version, url, sha256)
    values (900002, '9.9.9', 'https://x', upper(hash));
    raise exception 'FALLA: aceptó un sha256 en mayúsculas';
  exception when check_violation then null;
  end;
  begin
    insert into inventariado.versiones_app (version_code, version, url, sha256)
    values (900003, '9.9.9', 'https://x', 'abc');
    raise exception 'FALLA: aceptó un sha256 corto';
  exception when check_violation then null;
  end;

  -- Las versiones antiguas sin hash siguen siendo válidas.
  insert into inventariado.versiones_app (version_code, version, url) values (900004, '9.9.9', 'https://x');
  if (select sha256 from inventariado.versiones_app where version_code = 900004) is not null then
    raise exception 'FALLA: una versión sin hash no quedó con sha256 nulo';
  end if;

  delete from inventariado.versiones_app where version_code between 900001 and 900004;
end;
$$;
