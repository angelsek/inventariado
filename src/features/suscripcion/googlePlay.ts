/**
 * Suscripción con Google Play Billing (solo en la versión instalada desde Play).
 *
 * Flujo: la app pide a Google la compra del plan (con la prueba de 14 días) →
 * Google cobra con la tarjeta de la cuenta del cliente → la app manda el token de
 * compra a la función verificar-compra-play de Supabase, que lo confirma con
 * Google y activa la suscripción del negocio para todos sus teléfonos → la app
 * cierra la transacción. Renovaciones y cancelaciones llegan solas al servidor.
 */
import {
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  type Purchase,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'expo-iap';

import { mensajeDeError, supabase } from '@/lib/supabase';

/** Productos de suscripción creados en Play Console. */
export const PRODUCTOS_PLAY = { basico: 'stockeao_basico', pro: 'stockeao_pro' } as const;

export type PlanPlay = {
  plan: keyof typeof PRODUCTOS_PLAY;
  productoId: string;
  /** Precio mensual con formato de Google (ej. "$9.990"). */
  precio: string;
  /** Oferta a comprar (la que trae la prueba gratis, si el cliente todavía puede usarla). */
  ofertaToken: string;
  /** Días gratis de la oferta, o 0 si ya usó la prueba. */
  diasPrueba: number;
};

type Fase = { priceAmountMicros: string; formattedPrice: string; billingPeriod: string };
type Oferta = {
  offerTokenAndroid?: string | null;
  pricingPhasesAndroid?: { pricingPhaseList: Fase[] } | null;
};

// "P14D" → 14, "P2W" → 14, "P1M" → 30.
function diasDePeriodo(periodo: string): number {
  const m = /^P(\d+)([DWM])$/.exec(periodo);
  if (!m) return 0;
  return Number(m[1]) * ({ D: 1, W: 7, M: 30 } as const)[m[2] as 'D' | 'W' | 'M'];
}

/** Elige la oferta con prueba gratis (Google solo la entrega si el cliente puede usarla). */
export function elegirOferta(
  ofertas: Oferta[],
): { token: string; precio: string; diasPrueba: number } | null {
  const conFases = ofertas
    .filter((o) => o.offerTokenAndroid)
    .map((o) => {
      const fases = o.pricingPhasesAndroid?.pricingPhaseList ?? [];
      const gratis = fases.find((f) => f.priceAmountMicros === '0');
      const normal = fases.find((f) => f.priceAmountMicros !== '0');
      return {
        token: o.offerTokenAndroid!,
        precio: normal?.formattedPrice ?? '',
        diasPrueba: gratis ? diasDePeriodo(gratis.billingPeriod) : 0,
      };
    });
  return conFases.sort((a, b) => b.diasPrueba - a.diasPrueba)[0] ?? null;
}

let conectado: Promise<unknown> | null = null;
const conectar = () =>
  (conectado ??= initConnection().catch((e) => {
    conectado = null;
    throw e;
  }));

/** Planes con su precio en Play (en la moneda y formato del cliente). */
export async function obtenerPlanesPlay(): Promise<PlanPlay[]> {
  await conectar();
  const productos = ((await fetchProducts({
    skus: Object.values(PRODUCTOS_PLAY),
    type: 'subs',
  })) ?? []) as { id: string; displayPrice: string; subscriptionOffers?: Oferta[] }[];
  const planes: PlanPlay[] = [];
  for (const [plan, productoId] of Object.entries(PRODUCTOS_PLAY)) {
    const producto = productos.find((p) => p.id === productoId);
    const oferta = producto && elegirOferta(producto.subscriptionOffers ?? []);
    if (!producto || !oferta) continue;
    planes.push({
      plan: plan as PlanPlay['plan'],
      productoId,
      precio: oferta.precio || producto.displayPrice,
      ofertaToken: oferta.token,
      diasPrueba: oferta.diasPrueba,
    });
  }
  return planes;
}

/** Abre la ventana de pago de Google. El resultado llega a escucharCompras(). */
export async function comprarPlan(plan: PlanPlay, negocioId: string): Promise<void> {
  await conectar();
  await requestPurchase({
    type: 'subs',
    request: {
      google: {
        skus: [plan.productoId],
        subscriptionOffers: [{ sku: plan.productoId, offerToken: plan.ofertaToken }],
        // Google guarda el negocio en la compra: así los avisos de renovación
        // llegan al negocio correcto.
        obfuscatedAccountId: negocioId,
      },
    },
  });
}

/** Confirma la compra en el servidor y la cierra en Google. */
export async function verificarCompra(compra: Purchase, negocioId: string): Promise<void> {
  if (!compra.purchaseToken) throw new Error('La compra no trae token.');
  const { error } = await supabase.functions.invoke('verificar-compra-play', {
    body: { purchaseToken: compra.purchaseToken, negocioId },
  });
  if (error) throw new Error(`No se pudo activar la suscripción. ${mensajeDeError(error)}`);
  await finishTransaction({ purchase: compra, isConsumable: false });
}

/**
 * Escucha las compras aprobadas por Google, las verifica y avisa el resultado.
 * Devuelve la función para dejar de escuchar.
 */
export function escucharCompras(
  negocioId: string,
  alTerminar: (resultado: { ok: true } | { ok: false; error: string | null }) => void,
): () => void {
  const compras = purchaseUpdatedListener((compra) => {
    if (compra.purchaseState !== 'purchased') return; // pendiente: se verifica al confirmarse
    verificarCompra(compra, negocioId)
      .then(() => alTerminar({ ok: true }))
      .catch((e) => alTerminar({ ok: false, error: mensajeDeError(e) }));
  });
  const errores = purchaseErrorListener((e) =>
    // Si el cliente cerró la ventana de pago no es un error que mostrar.
    alTerminar({ ok: false, error: String(e.code) === 'user-cancelled' ? null : e.message }),
  );
  return () => {
    compras.remove();
    errores.remove();
  };
}

/**
 * Compras aprobadas que no alcanzaron a verificarse (se cerró la app, sin
 * internet...). Se revisan al abrir la app: Google las reembolsa si no se
 * confirman en 3 días.
 */
export async function revisarComprasPendientes(negocioId: string): Promise<number> {
  await conectar();
  const productos = Object.values(PRODUCTOS_PLAY) as string[];
  const pendientes = (await getAvailablePurchases()).filter(
    (c) =>
      productos.includes(c.productId) &&
      c.purchaseState === 'purchased' &&
      !('isAcknowledgedAndroid' in c && c.isAcknowledgedAndroid),
  );
  for (const compra of pendientes) await verificarCompra(compra, negocioId);
  return pendientes.length;
}

/** Abre la pantalla de Google Play para cambiar la tarjeta o cancelar. */
export async function administrarEnPlay(productoId?: string): Promise<void> {
  await deepLinkToSubscriptions({
    skuAndroid: productoId ?? PRODUCTOS_PLAY.basico,
    packageNameAndroid: 'cl.stockeao.app',
  });
}
