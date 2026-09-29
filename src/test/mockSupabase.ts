/**
 * Reemplazo de '@/lib/supabase' para pruebas de pantallas:
 * jest.mock('@/lib/supabase', () => require('@/test/mockSupabase')).
 * Las respuestas se configuran con `respuestasRpc` y `respuestasTabla`.
 */
export const supabaseConfigurado = true;

export const respuestasRpc: Record<string, { data: unknown; error: unknown }> = {};
export const respuestasTabla: Record<string, { data: unknown; error: unknown }> = {};

const sinRespuesta = { data: null, error: null };

/** Consulta encadenable (select().order().limit()...) que resuelve la respuesta de la tabla. */
function consulta(tabla: string) {
  const resultado = () => Promise.resolve(respuestasTabla[tabla] ?? { data: [], error: null });
  const cadena: Record<string, unknown> = {};
  for (const metodo of ['select', 'order', 'limit', 'eq', 'maybeSingle']) {
    cadena[metodo] = () => cadena;
  }
  cadena.then = (ok: (v: unknown) => unknown, error?: (e: unknown) => unknown) =>
    resultado().then(ok, error);
  return cadena;
}

export const supabase = {
  rpc: jest.fn((nombre: string) => Promise.resolve(respuestasRpc[nombre] ?? sinRespuesta)),
  from: jest.fn((tabla: string) => consulta(tabla)),
  auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null } })) },
};

export const mensajeDeError = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === 'object' && e && 'message' in e
      ? String(e.message)
      : String(e);
