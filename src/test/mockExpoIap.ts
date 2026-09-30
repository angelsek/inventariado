// Simulación de expo-iap (Google Play Billing) para las pruebas.
export const initConnection = jest.fn(async () => true);
export const fetchProducts = jest.fn(async () => [] as unknown[]);
export const requestPurchase = jest.fn(async () => null);
export const finishTransaction = jest.fn(async () => undefined);
export const getAvailablePurchases = jest.fn(async () => [] as unknown[]);
export const deepLinkToSubscriptions = jest.fn(async () => undefined);

type Oyente = (evento: unknown) => void;
export const oyentes: { compras: Oyente[]; errores: Oyente[] } = { compras: [], errores: [] };
export const purchaseUpdatedListener = jest.fn((fn: Oyente) => {
  oyentes.compras.push(fn);
  return { remove: () => (oyentes.compras = oyentes.compras.filter((f) => f !== fn)) };
});
export const purchaseErrorListener = jest.fn((fn: Oyente) => {
  oyentes.errores.push(fn);
  return { remove: () => (oyentes.errores = oyentes.errores.filter((f) => f !== fn)) };
});
