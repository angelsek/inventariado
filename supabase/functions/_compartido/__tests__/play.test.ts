import { aplicarCompra, type ClienteSupabase, interpretarSuscripcion } from '../play';

const activa = {
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  externalAccountIdentifiers: { obfuscatedExternalAccountId: 'negocio-1' },
  lineItems: [
    {
      productId: 'stockeao_pro',
      expiryTime: '2030-01-15T00:00:00Z',
      autoRenewingPlan: { autoRenewEnabled: true },
    },
  ],
};

describe('interpretarSuscripcion', () => {
  it('suscripción activa (o en su prueba gratis): vigente hasta la fecha de Google', () => {
    expect(interpretarSuscripcion(activa)).toEqual({
      productoId: 'stockeao_pro',
      planId: 'pro',
      estado: 'SUBSCRIPTION_STATE_ACTIVE',
      expiraEn: '2030-01-15T00:00:00Z',
      autoRenueva: true,
      negocioId: 'negocio-1',
      vigente: true,
      requiereReconocer: true,
      tokenReemplazado: null,
    });
  });

  it('cancelada sigue valiendo hasta que vence; pendiente no da acceso', () => {
    const cancelada = interpretarSuscripcion({
      ...activa,
      subscriptionState: 'SUBSCRIPTION_STATE_CANCELED',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    });
    expect(cancelada).toMatchObject({ vigente: true, requiereReconocer: false });

    const pendiente = interpretarSuscripcion({
      ...activa,
      subscriptionState: 'SUBSCRIPTION_STATE_PENDING',
    });
    expect(pendiente).toMatchObject({ vigente: false, requiereReconocer: false });
  });

  it('producto desconocido no tiene plan; cambio de plan informa la compra reemplazada', () => {
    expect(
      interpretarSuscripcion({ ...activa, lineItems: [{ productId: 'otro', expiryTime: 'x' }] })
        .planId,
    ).toBeNull();
    expect(
      interpretarSuscripcion({ ...activa, linkedPurchaseToken: 'viejo' }).tokenReemplazado,
    ).toBe('viejo');
  });
});

function clienteFalso(estadoPrevio: string | null) {
  const llamadas: { rpc?: Record<string, unknown>; actualizado?: [string, string] } = {};
  const cliente: ClienteSupabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: estadoPrevio ? { estado: estadoPrevio } : null,
            error: null,
          }),
        }),
      }),
      update: (valores) => ({
        eq: async (_c, valor) => {
          llamadas.actualizado = [String(valores.estado), valor];
          return { error: null };
        },
      }),
    }),
    rpc: async (_f, argumentos) => {
      llamadas.rpc = argumentos;
      return { error: null };
    },
  };
  return { cliente, llamadas };
}

describe('aplicarCompra', () => {
  it('guarda la compra y marca como reemplazada la anterior', async () => {
    const { cliente, llamadas } = clienteFalso(null);
    const compra = interpretarSuscripcion({ ...activa, linkedPurchaseToken: 'viejo' });
    await aplicarCompra(cliente, 'nuevo', 'negocio-1', compra, 'usuario-1');
    expect(llamadas.rpc).toMatchObject({
      p_token: 'nuevo',
      p_negocio_id: 'negocio-1',
      p_plan_id: 'pro',
      p_expira_en: '2030-01-15T00:00:00Z',
      p_usuario_id: 'usuario-1',
      p_vigente: true,
    });
    expect(llamadas.actualizado).toEqual(['REEMPLAZADA', 'viejo']);
  });

  it('un aviso tardío de una compra reemplazada no pisa la suscripción', async () => {
    const { cliente, llamadas } = clienteFalso('REEMPLAZADA');
    const vencida = interpretarSuscripcion({
      ...activa,
      subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED',
    });
    await aplicarCompra(cliente, 'viejo', 'negocio-1', vencida, null);
    expect(llamadas.rpc).toMatchObject({ p_estado: 'REEMPLAZADA', p_vigente: false });
  });
});
