import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { AJUSTE_DISPOSITIVO, AJUSTE_NEGOCIO, guardarAjuste, leerAjuste } from '@/db/ajustes';
import { registrarDispositivo } from '@/db/dispositivos';
import { borrarDatosLocales } from '@/db/negocio';
import type { BaseLocal } from '@/db/tipos';
import { hashPin } from '@/lib/pin';
import { supabase } from '@/lib/supabase';
import { sincronizar } from '@/sync/motor';
import { remotoSupabase } from '@/sync/remotoSupabase';

import { useSesion } from './store';

export type DatosNegocio = {
  nombreNegocio: string;
  rut: string;
  direccion: string;
  nombreDueno: string;
  pin: string;
};

/** Resultado de crear cuenta o iniciar sesión. */
export type Resultado =
  | { tipo: 'listo' }
  /** Supabase pide confirmar el correo antes de continuar. */
  | { tipo: 'confirmar_correo' }
  /** La cuenta existe pero aún no tiene negocio (ej. se confirmó el correo después). */
  | { tipo: 'sin_negocio' };

/** Crea la cuenta del dueño y su negocio. */
export async function crearCuentaYNegocio(
  db: BaseLocal,
  correo: string,
  contrasena: string,
  datos: DatosNegocio,
): Promise<Resultado> {
  const { data, error } = await supabase.auth.signUp({
    email: correo.trim(),
    password: contrasena,
  });
  if (error) throw error;
  if (!data.session) return { tipo: 'confirmar_correo' };

  await crearNegocio(db, datos);
  return { tipo: 'listo' };
}

/** Crea el negocio para la cuenta con sesión iniciada y vincula este teléfono. */
export async function crearNegocio(db: BaseLocal, datos: DatosNegocio): Promise<void> {
  const perfilId = randomUUID();
  const { data: negocioId, error } = await supabase.rpc('crear_negocio', {
    p_nombre: datos.nombreNegocio,
    p_rut: datos.rut,
    p_direccion: datos.direccion,
    p_perfil_id: perfilId,
    p_nombre_dueno: datos.nombreDueno,
    p_pin_hash: await hashPin(perfilId, datos.pin),
  });
  if (error) throw new Error(error.message);

  await vincularTelefono(db, negocioId as string);
}

/** Inicia sesión y, si la cuenta tiene negocio, vincula este teléfono a él. */
export async function iniciarSesion(
  db: BaseLocal,
  correo: string,
  contrasena: string,
): Promise<Resultado> {
  const { error } = await supabase.auth.signInWithPassword({
    email: correo.trim(),
    password: contrasena,
  });
  if (error) throw error;

  const { data, error: errorNegocio } = await supabase
    .from('negocio_usuarios')
    .select('negocio_id')
    .limit(1)
    .maybeSingle();
  if (errorNegocio) throw new Error(errorNegocio.message);
  if (!data) return { tipo: 'sin_negocio' };

  await vincularTelefono(db, data.negocio_id as string);
  return { tipo: 'listo' };
}

/** Cierra la sesión y borra los datos del negocio guardados en este teléfono. */
export async function cerrarSesion(db: BaseLocal): Promise<void> {
  // scope local: funciona sin internet.
  await supabase.auth.signOut({ scope: 'local' });
  await borrarDatosLocales(db);
  useSesion.getState().desvincular();
}

async function vincularTelefono(db: BaseLocal, negocioId: string): Promise<void> {
  await borrarDatosLocales(db);

  let dispositivoId = await leerAjuste(db, AJUSTE_DISPOSITIVO);
  if (!dispositivoId) {
    dispositivoId = randomUUID();
    await guardarAjuste(db, AJUSTE_DISPOSITIVO, dispositivoId);
  }
  await registrarDispositivo(db, { id: dispositivoId, negocioId, nombre: nombreDelTelefono() });

  // La primera sincronización trae el negocio y los perfiles: sin ella no se puede elegir usuario.
  await sincronizar(db, remotoSupabase, negocioId);
  await guardarAjuste(db, AJUSTE_NEGOCIO, negocioId);
  useSesion.getState().vincular(negocioId);
}

function nombreDelTelefono(): string {
  const constantes = Platform.constants as { Brand?: string; Model?: string };
  const nombre = [constantes.Brand, constantes.Model].filter(Boolean).join(' ');
  return nombre || 'Teléfono';
}
