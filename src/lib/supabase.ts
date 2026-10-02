import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import AsyncStorage from 'expo-sqlite/kv-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const clave = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

/** false si el APK se construyó sin los datos del proyecto Supabase. */
export const supabaseConfigurado = url !== '' && clave !== '';

/**
 * Esquema de Postgres con las tablas de la app. Permite compartir el proyecto de
 * Supabase con otras aplicaciones (ver docs/SUPABASE.md).
 */
export const ESQUEMA = 'inventariado';

/** Cliente de Supabase. La sesión se guarda en el teléfono y sirve sin internet. */
export const supabase = createClient(
  supabaseConfigurado ? url : 'https://sin-configurar.supabase.co',
  supabaseConfigurado ? clave : 'sin-configurar',
  {
    db: { schema: ESQUEMA },
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Renueva el token solo con la app en primer plano (recomendación de Supabase para React Native).
AppState.addEventListener('change', (estado) => {
  if (!supabaseConfigurado) return;
  if (estado === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Traduce los errores más comunes de Supabase a mensajes para el usuario. */
export function mensajeDeError(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(mensaje)) return 'Correo o contraseña incorrectos.';
  if (/user already registered/i.test(mensaje)) return 'Ya existe una cuenta con ese correo.';
  const largo = mensaje.match(/password should be at least (\d+)/i);
  if (largo) return `La contraseña debe tener al menos ${largo[1]} caracteres.`;
  if (/password should contain/i.test(mensaje))
    return 'La contraseña debe combinar mayúsculas, minúsculas, números y símbolos.';
  if (/weak|pwned|easy to guess/i.test(mensaje))
    return 'Esa contraseña es muy fácil de adivinar. Elige otra.';
  if (/email not confirmed/i.test(mensaje))
    return 'Debes confirmar tu correo antes de iniciar sesión.';
  if (/invalid.*email|email.*invalid/i.test(mensaje)) return 'El correo no es válido.';
  if (/ya tiene un negocio/i.test(mensaje)) return 'Esta cuenta ya tiene un negocio.';
  if (/LIMITE_DISPOSITIVOS/.test(mensaje))
    return 'Tu plan no permite más teléfonos. Desvincula uno desde otro teléfono (Más → Suscripción) o cambia al plan Pro.';
  if (/could not find the (function|table)|schema cache/i.test(mensaje))
    return 'El servidor no está actualizado: falta ejecutar el SQL de la app en Supabase o recargar su esquema.';
  if (/invalid schema|schema must be one of/i.test(mensaje))
    return 'El servidor no está configurado: falta exponer el esquema "inventariado" en Supabase.';
  if (/network|fetch|timeout/i.test(mensaje))
    return 'No hay conexión a internet. Inténtalo de nuevo.';
  return mensaje;
}
