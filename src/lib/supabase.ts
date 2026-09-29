import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import AsyncStorage from 'expo-sqlite/kv-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const clave = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

/** false si el APK se construyó sin los datos del proyecto Supabase. */
export const supabaseConfigurado = url !== '' && clave !== '';

/** Cliente de Supabase. La sesión se guarda en el teléfono y sirve sin internet. */
export const supabase: SupabaseClient = createClient(
  supabaseConfigurado ? url : 'https://sin-configurar.supabase.co',
  supabaseConfigurado ? clave : 'sin-configurar',
  {
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
  if (/password should be at least/i.test(mensaje))
    return 'La contraseña debe tener al menos 6 caracteres.';
  if (/email not confirmed/i.test(mensaje))
    return 'Debes confirmar tu correo antes de iniciar sesión.';
  if (/invalid.*email|email.*invalid/i.test(mensaje)) return 'El correo no es válido.';
  if (/ya tiene un negocio/i.test(mensaje)) return 'Esta cuenta ya tiene un negocio.';
  if (/network|fetch|timeout/i.test(mensaje))
    return 'No hay conexión a internet. Inténtalo de nuevo.';
  return mensaje;
}
