-- Integridad del APK: cada versión publicada guarda el SHA-256 de su APK.
--
-- Lo escribe el workflow "Construir APK" al publicar, y la app lo compara con el archivo
-- descargado antes de instalarlo (src/features/actualizacion/). Las versiones publicadas antes
-- de este cambio quedan con sha256 nulo y la app las instala sin verificar.
-- ultima_version() ya devuelve la fila completa (to_jsonb), así que no hay que cambiarla.
--
-- Debe aplicarse ANTES de publicar con el workflow nuevo: si falta la columna, la publicación falla.
-- Se puede ejecutar más de una vez sin error.

alter table inventariado.versiones_app
  add column if not exists sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$');

notify pgrst, 'reload schema';
