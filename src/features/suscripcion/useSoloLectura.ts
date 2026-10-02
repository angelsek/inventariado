import { Alert } from 'react-native';

import { useSesion } from '@/sesion/store';

export const MENSAJE_SOLO_LECTURA =
  'La suscripción está suspendida: puedes ver tus datos, pero no registrar ventas ni hacer cambios. Revisa Más → Suscripción.';

/** true si la suscripción está suspendida (la app queda en solo lectura). */
export function useSoloLectura(): boolean {
  return useSesion((s) => s.suscripcion?.soloLectura ?? false);
}

/** Para usar antes de guardar: avisa y devuelve true si no se puede modificar nada. */
export function bloqueadoPorSuscripcion(): boolean {
  if (!useSesion.getState().suscripcion?.soloLectura) return false;
  Alert.alert('Solo lectura', MENSAJE_SOLO_LECTURA);
  return true;
}
