import type { BaseLocal } from '@/db/tipos';
import { avisar } from '@/lib/dialogo';
import { cerrarSesion } from '@/sesion/cuenta';

/**
 * Pide confirmar el cierre de sesión del equipo (avisa si hay cambios sin subir, que se
 * perderían). Lo usan la pantalla Más del teléfono y Cuenta y equipo del PC.
 */
export function confirmarCierreSesion(db: BaseLocal, pendientes: number) {
  const advertencia =
    pendientes > 0 ? `Hay ${pendientes} cambio(s) sin subir que se perderán. ` : '';
  avisar(
    'Cerrar sesión',
    `${advertencia}Este equipo se desconectará del negocio y habrá que volver a ingresar con correo y contraseña.`,
    [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => cerrarSesion(db) },
    ],
  );
}
