import AsyncStorage from 'expo-sqlite/kv-store';

/** Dónde guarda Supabase la sesión. En el teléfono, el almacén clave-valor de expo-sqlite. */
export const almacenSesion = AsyncStorage;
