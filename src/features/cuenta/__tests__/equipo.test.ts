import { describirPc, RECIENTE_MS } from '../equipo';

const AHORA = new Date('2026-10-17T15:00:00Z').getTime();

it('advierte cuando un PC se usó hace un momento (puede seguir en uso)', () => {
  const reciente = new Date(AHORA - RECIENTE_MS / 2).toISOString();
  expect(describirPc({ id: 'a', nombre: 'PC mesón', ultimo_sync: reciente }, AHORA)).toBe(
    'PC mesón (en uso hace un momento)',
  );
});

it('muestra el último uso de un PC antiguo y los que nunca sincronizaron', () => {
  const antiguo = new Date(AHORA - 3 * 24 * 60 * 60 * 1000).toISOString();
  expect(describirPc({ id: 'a', nombre: 'PC bodega', ultimo_sync: antiguo }, AHORA)).toMatch(
    /^PC bodega \(último uso .+\)$/,
  );
  expect(describirPc({ id: 'b', nombre: 'PC nuevo', ultimo_sync: null }, AHORA)).toBe(
    'PC nuevo (nunca sincronizó)',
  );
});
