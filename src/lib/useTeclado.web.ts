import { useEffect, useRef } from 'react';

/**
 * Web (PC): avisa cada tecla presionada en la ventana mientras `activo`
 * (sin Ctrl/Alt, para no chocar con los atajos del navegador).
 */
export function useTeclado(alTeclear: (tecla: string) => void, activo = true) {
  const ultimo = useRef(alTeclear);
  useEffect(() => {
    ultimo.current = alTeclear;
  }, [alTeclear]);

  useEffect(() => {
    if (!activo) return;
    const escuchar = (evento: KeyboardEvent) => {
      if (evento.ctrlKey || evento.altKey || evento.metaKey) return;
      ultimo.current(evento.key);
    };
    window.addEventListener('keydown', escuchar);
    return () => window.removeEventListener('keydown', escuchar);
  }, [activo]);
}
