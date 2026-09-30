/**
 * Lógica de las suscripciones de Google Play, sin dependencias de Deno para
 * poder probarla con Jest. La usan las funciones verificar-compra-play y
 * notificaciones-play.
 */

/** Productos de suscripción creados en Play Console y el plan que activan. */
export const PRODUCTOS_PLAY: Record<string, string> = {
  stockeao_basico: 'basico',
  stockeao_pro: 'pro',
};

/** Respuesta de purchases.subscriptionsv2.get (solo los campos que se usan). */
export type SuscripcionGoogle = {
  subscriptionState?: string;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: {
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
  }[];
};

export type CompraInterpretada = {
  productoId: string | null;
  planId: string | null;
  estado: string;
  expiraEn: string | null;
  autoRenueva: boolean;
  /** Negocio que hizo la compra (la app lo manda como obfuscatedAccountId). */
  negocioId: string | null;
  /** Si la fecha de vencimiento debe aplicarse a la suscripción del negocio. */
  vigente: boolean;
  /** Google devuelve la compra si no se reconoce dentro de 3 días. */
  requiereReconocer: boolean;
  /** Compra anterior reemplazada por esta (cambio de plan). */
  tokenReemplazado: string | null;
};

// Estados en que la fecha de Google manda sobre la suscripción: activa, en
// gracia o cancelada (vale hasta que vence), y también retenida, pausada o
// vencida (la fecha ya pasó y la app muestra la suscripción vencida).
// PENDING (pago aún no confirmado) no da acceso.
const NO_VIGENTES = new Set(['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_UNSPECIFIED']);

export function interpretarSuscripcion(s: SuscripcionGoogle): CompraInterpretada {
  const estado = s.subscriptionState ?? 'SUBSCRIPTION_STATE_UNSPECIFIED';
  // Si hay varias líneas, vale la que vence más tarde.
  const linea = [...(s.lineItems ?? [])].sort((a, b) =>
    (b.expiryTime ?? '').localeCompare(a.expiryTime ?? ''),
  )[0];
  const productoId = linea?.productId ?? null;
  return {
    productoId,
    planId: productoId ? (PRODUCTOS_PLAY[productoId] ?? null) : null,
    estado,
    expiraEn: linea?.expiryTime ?? null,
    autoRenueva: linea?.autoRenewingPlan?.autoRenewEnabled ?? false,
    negocioId: s.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    vigente: !NO_VIGENTES.has(estado) && !!linea?.expiryTime,
    requiereReconocer:
      s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && !NO_VIGENTES.has(estado),
    tokenReemplazado: s.linkedPurchaseToken ?? null,
  };
}

/** Parte del cliente de Supabase que se usa para guardar (fácil de simular en pruebas). */
export type ClienteSupabase = {
  from(tabla: string): {
    select(columnas: string): {
      eq(
        columna: string,
        valor: string,
      ): { maybeSingle(): PromiseLike<{ data: { estado: string } | null; error: unknown }> };
    };
    update(valores: Record<string, unknown>): {
      eq(columna: string, valor: string): PromiseLike<{ error: unknown }>;
    };
  };
  rpc(funcion: string, argumentos: Record<string, unknown>): PromiseLike<{ error: unknown }>;
};

export const REEMPLAZADA = 'REEMPLAZADA';

/**
 * Guarda la compra y actualiza la suscripción del negocio. Una compra
 * reemplazada por un cambio de plan ya no toca la suscripción (si no, su
 * vencimiento podría pisar el de la compra nueva).
 */
export async function aplicarCompra(
  cliente: ClienteSupabase,
  token: string,
  negocioId: string,
  compra: CompraInterpretada,
  usuarioId: string | null,
): Promise<void> {
  if (!compra.planId || !compra.productoId) throw new Error('Producto desconocido');
  const previa = await cliente
    .from('compras_play')
    .select('estado')
    .eq('purchase_token', token)
    .maybeSingle();
  const reemplazada = previa.data?.estado === REEMPLAZADA;
  const { error } = await cliente.rpc('aplicar_compra_play', {
    p_token: token,
    p_negocio_id: negocioId,
    p_producto_id: compra.productoId,
    p_plan_id: compra.planId,
    p_estado: reemplazada ? REEMPLAZADA : compra.estado,
    p_expira_en: compra.expiraEn,
    p_auto_renueva: compra.autoRenueva,
    p_usuario_id: usuarioId,
    p_vigente: compra.vigente && !reemplazada,
  });
  if (error) throw new Error(`No se pudo guardar la compra: ${JSON.stringify(error)}`);
  if (compra.tokenReemplazado) {
    await cliente
      .from('compras_play')
      .update({ estado: REEMPLAZADA })
      .eq('purchase_token', compra.tokenReemplazado);
  }
}
