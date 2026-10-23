import { router } from 'expo-router';

import { avisar } from '@/lib/dialogo';
import { useSesion } from '@/sesion/store';

import { MENSAJE_SIN_PRUEBA } from './estado';

/**
 * Se llama justo después de crear el negocio. Si nació sin prueba gratis (su equipo, su correo
 * o su RUT ya la usaron), explica por qué la app queda en solo lectura y lleva a los planes,
 * donde está el botón para escribir por WhatsApp. Sin esto, el dueño vería una app en blanco
 * sin entender qué pasó.
 */
export function avisarSiNacioSinPrueba(): boolean {
  if (!useSesion.getState().suscripcion?.sinPrueba) return false;
  avisar('Sin prueba gratis', MENSAJE_SIN_PRUEBA, [
    { text: 'Ahora no', style: 'cancel' },
    { text: 'Ver planes', onPress: () => router.push('/suscripcion') },
  ]);
  return true;
}
