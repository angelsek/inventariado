import { colores } from '@/theme/colores';
import { EncabezadoPagina, type PropsEncabezado } from '@/web/componentes/EncabezadoPagina.web';

/** Ancho máximo del contenido de las pantallas del teléfono en el PC (no se estiran). */
export const ANCHO_PAGINA = 960;

/**
 * Web (PC): encabezado de escritorio (título, migas y acciones) y contenido centrado con ancho
 * máximo. `inferior` no se usa: en el PC no hay botones del sistema abajo.
 */
export function opcionesPantalla(title: string, _inferior: number) {
  return {
    headerShown: true,
    title,
    header: (props: PropsEncabezado) => <EncabezadoPagina {...props} />,
    contentStyle: {
      width: '100%' as const,
      maxWidth: ANCHO_PAGINA,
      alignSelf: 'center' as const,
      backgroundColor: colores.fondo,
    },
  };
}
