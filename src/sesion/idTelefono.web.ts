import { randomUUID } from 'expo-crypto';

/**
 * Web (PC): el navegador no da un id del equipo, así que al vincular se crea uno al azar
 * y queda en la base local (AJUSTE_DISPOSITIVO). Si se borran los datos del sitio, el dueño
 * puede indicar qué PC reemplaza para no gastar otro cupo (ver vincular en cuenta.ts).
 */
export async function idTelefonoEstable(): Promise<string> {
  return randomUUID();
}
