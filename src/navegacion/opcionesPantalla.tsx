import { colores } from '@/theme/colores';

/**
 * Opciones de las pantallas con encabezado del Stack raíz (src/app/_layout.tsx). En el teléfono:
 * encabezado nativo y espacio abajo para los botones del sistema (`inferior`). En el PC, ver
 * opcionesPantalla.web.tsx (encabezado de escritorio con migas y ancho máximo).
 */
export function opcionesPantalla(title: string, inferior: number) {
  return {
    headerShown: true,
    title,
    headerStyle: { backgroundColor: colores.superficie },
    contentStyle: { paddingBottom: inferior, backgroundColor: colores.fondo },
  };
}
