/**
 * Escritorio: no hay Google Play Billing (se cobra por transferencia, ver CANAL en
 * src/config.ts). Mantiene la API de googlePlay.ts para que expo-iap no entre al build.
 */
export const PRODUCTOS_PLAY = { basico: 'stockeao_basico', pro: 'stockeao_pro' } as const;

export type PlanPlay = {
  plan: keyof typeof PRODUCTOS_PLAY;
  productoId: string;
  precio: string;
  ofertaToken: string;
  diasPrueba: number;
};

const sinPlay = () => new Error('Google Play no está disponible en el escritorio.');

export const elegirOferta = () => null;
export const obtenerPlanesPlay = async (): Promise<PlanPlay[]> => [];
export const comprarPlan = async (): Promise<void> => {
  throw sinPlay();
};
export const verificarCompra = async (): Promise<void> => {
  throw sinPlay();
};
export const escucharCompras = (): (() => void) => () => {};
export const revisarComprasPendientes = async (): Promise<number> => 0;
export const administrarEnPlay = async (): Promise<void> => {
  throw sinPlay();
};
