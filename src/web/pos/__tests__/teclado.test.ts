import { accionDeTecla, type ContextoTecla } from '../teclado';

const venta: ContextoTecla = { modo: 'venta', buscadorConTexto: false, hayItems: true };
const cobro: ContextoTecla = { modo: 'cobro', buscadorConTexto: false, hayItems: true };

it('F9 a F12 cobran con efectivo, débito, crédito y transferencia', () => {
  expect(accionDeTecla({ key: 'F9' }, venta)).toEqual({ tipo: 'cobrar', medio: 'efectivo' });
  expect(accionDeTecla({ key: 'F10' }, venta)).toEqual({ tipo: 'cobrar', medio: 'debito' });
  expect(accionDeTecla({ key: 'F11' }, venta)).toEqual({ tipo: 'cobrar', medio: 'credito' });
  expect(accionDeTecla({ key: 'F12' }, venta)).toEqual({ tipo: 'cobrar', medio: 'transferencia' });
  expect(accionDeTecla({ key: 'F8' }, venta)).toEqual({ tipo: 'otrosPagos' });
});

it('sin productos no se puede cobrar ni cancelar', () => {
  const vacia = { ...venta, hayItems: false };
  expect(accionDeTecla({ key: 'F9' }, vacia)).toBeNull();
  expect(accionDeTecla({ key: 'Escape' }, vacia)).toBeNull();
  expect(accionDeTecla({ key: 'F4' }, vacia)).toEqual({ tipo: 'montoLibre' });
});

it('con texto en el buscador, + - Supr y flechas quedan para escribir', () => {
  const escribiendo = { ...venta, buscadorConTexto: true };
  for (const key of ['+', '-', 'Delete', 'ArrowUp', 'ArrowDown', 'Escape']) {
    expect(accionDeTecla({ key }, escribiendo)).toBeNull();
  }
  expect(accionDeTecla({ key: '+' }, venta)).toEqual({ tipo: 'cantidad', paso: 1 });
  expect(accionDeTecla({ key: 'Delete' }, venta)).toEqual({ tipo: 'quitar' });
});

it('en el cobro, Enter confirma y Esc vuelve; los números se escriben normalmente', () => {
  expect(accionDeTecla({ key: 'Enter' }, cobro)).toEqual({ tipo: 'confirmar' });
  expect(accionDeTecla({ key: 'Escape' }, cobro)).toEqual({ tipo: 'cancelar' });
  expect(accionDeTecla({ key: '5' }, cobro)).toBeNull();
  expect(accionDeTecla({ key: '+' }, cobro)).toBeNull();
  expect(accionDeTecla({ key: 'F10' }, cobro)).toEqual({ tipo: 'cobrar', medio: 'debito' });
});

it('no toma atajos con Ctrl o Alt (son del navegador)', () => {
  expect(accionDeTecla({ key: 'F9', ctrlKey: true }, venta)).toBeNull();
  expect(accionDeTecla({ key: 'Enter', altKey: true }, cobro)).toBeNull();
});
