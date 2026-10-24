import { PantallaLegal } from '@/features/legal/PantallaLegal';
import { ELIMINAR_CUENTA } from '@/legal/textos';

/**
 * Página pública que explica cómo eliminar la cuenta: es la URL que revisa Google Play.
 * No borra nada; la pantalla que sí lo hace es `src/app/eliminar-cuenta.tsx`.
 */
export default function EliminarCuentaLegalScreen() {
  return <PantallaLegal texto={ELIMINAR_CUENTA} />;
}
