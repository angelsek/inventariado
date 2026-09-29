/**
 * Datos de contacto para pagar la suscripción. Se configuran como variables de
 * GitHub (SUPABASE_... ya existen; ver docs/SUPABASE.md) o en .env.local.
 */
export const CONTACTO = {
  whatsapp: process.env.EXPO_PUBLIC_CONTACTO_WHATSAPP ?? '',
  correo: process.env.EXPO_PUBLIC_CONTACTO_CORREO ?? '',
  datosTransferencia: process.env.EXPO_PUBLIC_DATOS_TRANSFERENCIA ?? '',
};
