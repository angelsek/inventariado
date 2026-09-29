// Reemplazo de expo-crypto para pruebas en Node: jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto')).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require('crypto') as {
  randomUUID(): string;
  createHash(alg: string): { update(d: string): { digest(f: string): string } };
};

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' };
export const randomUUID = () => nodeCrypto.randomUUID();
export const digestStringAsync = async (_algoritmo: string, datos: string) =>
  nodeCrypto.createHash('sha256').update(datos).digest('hex');
