/**
 * Texto corto del estado de la suscripción de un local, para el selector. Los estados son los
 * que devuelve inventariado.estado_suscripcion() en el servidor.
 */
export function textoEstadoLocal(estado: string | null | undefined): string {
  switch (estado) {
    case 'activa':
      return 'Plan al día';
    case 'prueba':
      return 'Prueba gratis';
    case 'vencida':
      return 'Plan vencido (en gracia)';
    case 'suspendida':
      return 'Sin plan activo';
    default:
      return '';
  }
}
