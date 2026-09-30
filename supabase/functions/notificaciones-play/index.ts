// Recibe los avisos de Google Play (renovaciones, cancelaciones, pagos fallidos,
// reembolsos) a través de Google Cloud Pub/Sub y actualiza la suscripción del negocio.
//
// Se publica sin verificación de sesión (--no-verify-jwt): Pub/Sub no tiene sesión
// de Supabase. En su lugar, la dirección lleva un token secreto: ?token=PLAY_RTDN_TOKEN
//
// Secretos: GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, PLAY_PACKAGE_NAME, PLAY_RTDN_TOKEN
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  type CuentaServicio,
  consultarSuscripcion,
  obtenerTokenAcceso,
} from '../_compartido/google.ts';
import {
  aplicarCompra,
  type ClienteSupabase,
  interpretarSuscripcion,
  type SuscripcionGoogle,
} from '../_compartido/play.ts';

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token');
  if (!token || token !== Deno.env.get('PLAY_RTDN_TOKEN')) {
    return new Response('No autorizado', { status: 401 });
  }

  try {
    const cuerpo = await req.json();
    const datos = JSON.parse(atob(cuerpo?.message?.data ?? '') || '{}');
    const aviso = datos.subscriptionNotification;
    // Avisos de prueba (botón "Enviar notificación de prueba" de Play Console) u otros tipos.
    if (!aviso?.purchaseToken) return new Response('ok');

    const cuenta = JSON.parse(
      Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON') ?? '{}',
    ) as CuentaServicio;
    const paquete = datos.packageName ?? Deno.env.get('PLAY_PACKAGE_NAME') ?? 'cl.stockeao.app';
    const acceso = await obtenerTokenAcceso(cuenta);
    const compra = interpretarSuscripcion(
      (await consultarSuscripcion(acceso, paquete, aviso.purchaseToken)) as SuscripcionGoogle,
    );

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'inventariado' }, auth: { persistSession: false } },
    );

    // El negocio viene en la compra; si no, se busca por el token ya registrado.
    let negocioId = compra.negocioId;
    if (!negocioId) {
      const { data } = await admin
        .from('compras_play')
        .select('negocio_id')
        .eq('purchase_token', aviso.purchaseToken)
        .maybeSingle();
      negocioId = data?.negocio_id ?? null;
    }
    if (!negocioId || !compra.planId) {
      console.warn('Aviso sin negocio o de un producto desconocido', aviso);
      return new Response('ok');
    }

    await aplicarCompra(
      admin as unknown as ClienteSupabase,
      aviso.purchaseToken,
      negocioId,
      compra,
      null,
    );
    return new Response('ok');
  } catch (e) {
    // Error pasajero (Google o la base): Pub/Sub reintenta más tarde.
    console.error(e);
    return new Response('Error', { status: 500 });
  }
});
