import { useEffect, useRef } from 'react';

import { crearLectorPistola } from './pistola';

/**
 * Escritorio: escucha el teclado de toda la ventana mientras `activo` y avisa cada código
 * que llega de la pistola USB, aunque el cursor esté en un campo de texto.
 */
export function useLectorCodigos(alCodigo: (codigo: string) => void, activo = true) {
  const ultimo = useRef(alCodigo);
  useEffect(() => {
    ultimo.current = alCodigo;
  }, [alCodigo]);

  useEffect(() => {
    if (!activo) return;
    const lector = crearLectorPistola((codigo) => ultimo.current(codigo));
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return;
      if (lector.tecla(evento.key, evento.timeStamp)) {
        evento.preventDefault();
        evento.stopPropagation();
      }
    };
    // En captura, para ver el Enter antes que el campo de texto que tenga el foco.
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, [activo]);
}
