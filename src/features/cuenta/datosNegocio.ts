import type { DatosNegocio } from '@/sesion/cuenta';
import { esPinValido, LARGO_PIN } from '@/lib/pin';
import { esRutValido } from '@/lib/validacion';

export type FormNegocio = DatosNegocio & { pinConfirmado: string };

export const formNegocioVacio: FormNegocio = {
  nombreNegocio: '',
  rut: '',
  direccion: '',
  nombreDueno: '',
  pin: '',
  pinConfirmado: '',
};

export type Errores<T> = Partial<Record<keyof T, string>>;

export function validarNegocio(form: FormNegocio): Errores<FormNegocio> {
  const errores: Errores<FormNegocio> = {};
  if (!form.nombreNegocio.trim()) errores.nombreNegocio = 'Ingresa el nombre del negocio.';
  if (form.rut.trim() && !esRutValido(form.rut)) errores.rut = 'El RUT no es válido.';
  if (!form.nombreDueno.trim()) errores.nombreDueno = 'Ingresa tu nombre.';
  if (!esPinValido(form.pin)) errores.pin = `El PIN debe tener ${LARGO_PIN} números.`;
  else if (form.pin !== form.pinConfirmado) errores.pinConfirmado = 'Los PIN no coinciden.';
  return errores;
}
