/**
 * UUID (versión 5, con forma válida para Postgres) a partir de una huella SHA-256 en hex.
 * Lo usan el teléfono (ANDROID_ID) y el escritorio (MachineGuid de Windows, en escritorio/).
 */
export function uuidDesdeHuella(h: string): string {
  const variante = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`,
    `${variante}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join('-');
}
