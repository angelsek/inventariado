/** Página pública de Stockeao (descarga, instrucciones y contacto). */
export const PAGINA_PUBLICA = 'https://grimoriolabs.com/stockeao/';

/**
 * Adónde lleva el enlace del correo de confirmación al crear la cuenta. El proyecto de Supabase se
 * comparte con otra app y su Site URL es el de ella: sin `emailRedirectTo`, el enlace llegaba allá.
 * Esta dirección debe estar en Authentication → URL Configuration → Redirect URLs (`docs/SUPABASE.md`);
 * si no está, Supabase la ignora y vuelve al Site URL.
 */
export const URL_CONFIRMACION_CORREO = PAGINA_PUBLICA;
