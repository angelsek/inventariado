/**
 * Pide al navegador que no borre los datos del sitio (base local y sesión) cuando le
 * falte espacio. Chrome y Edge lo conceden o no sin preguntar, según cuánto se usa el
 * sitio (más fácil si está instalado como app). No impide que alguien borre los datos
 * del sitio a mano.
 */
export async function pedirPersistencia(): Promise<boolean> {
  const almacenamiento = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!almacenamiento?.persist) return false;
  try {
    if (await almacenamiento.persisted()) return true;
    return await almacenamiento.persist();
  } catch {
    return false;
  }
}
