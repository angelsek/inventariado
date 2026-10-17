import { Alert } from 'react-native';

export type BotonDialogo = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

/**
 * Aviso o confirmación con botones, con la misma forma que `Alert.alert`. En el teléfono
 * es el diálogo de Android; en el escritorio, dialogo.web.ts (Alert no hace nada en web).
 */
export function avisar(...args: [titulo: string, mensaje?: string, botones?: BotonDialogo[]]) {
  // Se pasan los mismos argumentos que se recibieron (sin agregar undefined al final).
  Alert.alert(...args);
}

/** true si hay un aviso abierto (solo se usa en la web, para no mezclar atajos de teclado). */
export function hayDialogoAbierto(): boolean {
  return false;
}

/** Muestra los avisos de la web. En el teléfono no hace falta. */
export function HostDialogos() {
  return null;
}
