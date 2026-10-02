import { idDesdeAndroidId } from '../idTelefono';

jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

it('el mismo teléfono siempre da el mismo id, aunque se reinstale la app', async () => {
  const primero = await idDesdeAndroidId('dd96dec43fb81c97');
  expect(primero).toMatch(UUID);
  expect(await idDesdeAndroidId('dd96dec43fb81c97')).toBe(primero);
});

it('teléfonos distintos dan ids distintos y no exponen el ANDROID_ID', async () => {
  const a = await idDesdeAndroidId('dd96dec43fb81c97');
  const b = await idDesdeAndroidId('0123456789abcdef');
  expect(a).not.toBe(b);
  expect(a.replace(/-/g, '')).not.toContain('dd96dec43fb81c97');
});
