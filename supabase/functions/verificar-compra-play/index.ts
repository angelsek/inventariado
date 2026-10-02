// Confirma con Google una compra de suscripción hecha en la app y activa el negocio.
// La llama la app (con la sesión del dueño) apenas Google aprueba la compra.
//
// Secretos de la función (Supabase → Edge Functions → Secrets):
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  clave JSON de la cuenta de servicio con acceso a Play Console
//   PLAY_PACKAGE_NAME                 cl.stockeao.app
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  type CuentaServicio,
  consultarSuscripcion,
  obtenerTokenAcceso,
  reconocerSuscripcion,
} from '../_compartido/google.ts';
import {
  aplicarCompra,
  type ClienteSupabase,
  interpretarSuscripcion,
  type SuscripcionGoogle,
} from '../_compartido/play.ts';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  try {
    const { purchaseToken, negocioId } = await req.json();
    if (typeof purchaseToken !== 'string' || typeof negocioId !== 'string') {
      return json({ error: 'Faltan purchaseToken o negocioId' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { db: { schema: 'inventariado' }, auth: { persistSession: false } },
    );

    // Solo el dueño del negocio puede activar su suscripción.
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: sesion } = await admin.auth.getUser(jwt);
    if (!sesion.user) return json({ error: 'Sesión no válida' }, 401);
    const { data: miembro } = await admin
      .from('negocio_usuarios')
      .select('rol')
      .eq('negocio_id', negocioId)
      .eq('usuario_id', sesion.user.id)
      .maybeSingle();
    if (miembro?.rol !== 'dueno') return json({ error: 'Solo el dueño puede suscribirse' }, 403);

    const cuenta = JSON.parse(
      Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON') ?? '{}',
    ) as CuentaServicio;
    const paquete = Deno.env.get('PLAY_PACKAGE_NAME') ?? 'cl.stockeao.app';
    const acceso = await obtenerTokenAcceso(cuenta);
    const compra = interpretarSuscripcion(
      (await consultarSuscripcion(acceso, paquete, purchaseToken)) as SuscripcionGoogle,
    );

    // La compra se hizo para este negocio (la app manda su id a Google al comprar).
    if (compra.negocioId && compra.negocioId !== negocioId) {
      return json({ error: 'La compra es de otro negocio' }, 409);
    }
    if (!compra.planId) return json({ error: `Producto desconocido: ${compra.productoId}` }, 400);

    await aplicarCompra(
      admin as unknown as ClienteSupabase,
      purchaseToken,
      negocioId,
      compra,
      sesion.user.id,
    );
    if (compra.requiereReconocer) {
      await reconocerSuscripcion(acceso, paquete, compra.productoId!, purchaseToken);
    }
    return json({
      ok: true,
      estado: compra.estado,
      plan: compra.planId,
      expiraEn: compra.expiraEn,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
