/**
 * Acceso a la API de Google Play (Android Publisher) con una cuenta de servicio.
 * Solo usa fetch y WebCrypto: funciona en Deno (Supabase) y en Node.
 */

export type CuentaServicio = { client_email: string; private_key: string };

const base64url = (datos: ArrayBuffer | Uint8Array | string) => {
  const bytes =
    typeof datos === 'string'
      ? new TextEncoder().encode(datos)
      : datos instanceof Uint8Array
        ? datos
        : new Uint8Array(datos);
  let binario = '';
  bytes.forEach((b) => (binario += String.fromCharCode(b)));
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Token OAuth para la API de Google Play, firmado con la clave de la cuenta de servicio. */
export async function obtenerTokenAcceso(cuenta: CuentaServicio): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  const encabezado = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const contenido = base64url(
    JSON.stringify({
      iss: cuenta.client_email,
      scope: 'https://www.googleapis.com/auth/androidpublisher',
      aud: 'https://oauth2.googleapis.com/token',
      iat: ahora,
      exp: ahora + 3600,
    }),
  );
  const pem = cuenta.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const clave = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    clave,
    new TextEncoder().encode(`${encabezado}.${contenido}`),
  );
  const respuesta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${encabezado}.${contenido}.${base64url(firma)}`,
    }),
  });
  const datos = await respuesta.json();
  if (!respuesta.ok)
    throw new Error(`Google rechazó la cuenta de servicio: ${JSON.stringify(datos)}`);
  return datos.access_token as string;
}

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/** Estado actual de una suscripción según Google (purchases.subscriptionsv2.get). */
export async function consultarSuscripcion(
  accessToken: string,
  paquete: string,
  purchaseToken: string,
): Promise<unknown> {
  const respuesta = await fetch(
    `${API}/${paquete}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const datos = await respuesta.json();
  if (!respuesta.ok) throw new Error(`Google no encontró la compra: ${JSON.stringify(datos)}`);
  return datos;
}

/** Reconoce la compra (si no, Google la reembolsa a los 3 días). */
export async function reconocerSuscripcion(
  accessToken: string,
  paquete: string,
  productoId: string,
  purchaseToken: string,
): Promise<void> {
  const respuesta = await fetch(
    `${API}/${paquete}/purchases/subscriptions/${productoId}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  // 400 "already acknowledged" no es un problema: la app también reconoce.
  if (!respuesta.ok && respuesta.status !== 400) {
    throw new Error(`No se pudo reconocer la compra: ${await respuesta.text()}`);
  }
}
