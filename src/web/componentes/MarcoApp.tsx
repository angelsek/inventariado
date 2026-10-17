import type { ReactNode } from 'react';

/** Marco de la app. En el teléfono no agrega nada; en la web (PC), ver MarcoApp.web.tsx. */
export function MarcoApp({ children }: { children: ReactNode }) {
  return children;
}
