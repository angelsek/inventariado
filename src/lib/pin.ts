import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';

export const LARGO_PIN = 4;

export function esPinValido(pin: string): boolean {
  return new RegExp(`^\\d{${LARGO_PIN}}$`).test(pin);
}

/**
 * Hash del PIN de un perfil. El id del perfil actúa como sal.
 * El PIN solo sirve para cambiar de usuario en el teléfono: no protege la
 * cuenta del negocio, que requiere correo y contraseña.
 */
export function hashPin(perfilId: string, pin: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, `${perfilId}:${pin}`);
}
