import { Platform } from 'react-native';

import { Campo } from '@/components/Campo';
import { avisar } from '@/lib/dialogo';
import { formatearFechaHora } from '@/lib/formato';
import type { EquipoVinculado, OpcionesEquipo } from '@/sesion/cuenta';

const esPc = Platform.OS === 'web';

/** Un PC que sincronizó hace menos de esto puede estar en uso en otro lugar. */
export const RECIENTE_MS = 15 * 60 * 1000;

/** Nombre con que el PC aparece en la lista de equipos. En el teléfono no se pide. */
export function CampoNombreEquipo({
  valor,
  onCambio,
}: {
  valor: string;
  onCambio: (valor: string) => void;
}) {
  if (!esPc) return null;
  return (
    <Campo
      etiqueta="Nombre de este PC"
      placeholder="Ej: PC del mesón"
      value={valor}
      onChangeText={onCambio}
      maxLength={40}
      ayuda="Así lo verás en la lista de equipos del plan (Más → Suscripción)."
    />
  );
}

/** Texto de la opción de un PC a reemplazar (advierte si se usó hace poco). */
export function describirPc(pc: EquipoVinculado, ahora = Date.now()): string {
  if (!pc.ultimo_sync) return `${pc.nombre} (nunca sincronizó)`;
  const fecha = new Date(pc.ultimo_sync);
  const reciente = ahora - fecha.getTime() < RECIENTE_MS;
  return `${pc.nombre} (${reciente ? 'en uso hace un momento' : `último uso ${formatearFechaHora(fecha)}`})`;
}

/**
 * Pregunta si este PC reemplaza a uno ya vinculado (p. ej. se borraron los datos del
 * navegador): así no ocupa otro cupo del plan. Devuelve el id elegido o null si es nuevo.
 */
function elegirReemplazo(pcs: EquipoVinculado[]): Promise<string | null> {
  return new Promise((resolve, reject) => {
    avisar(
      '¿Este PC reemplaza a otro?',
      'Tu negocio ya tiene PC vinculados. Si este reemplaza a uno de ellos (por ejemplo, se ' +
        'borraron los datos del navegador), elígelo y no ocuparás otro cupo del plan. No ' +
        'elijas uno que se siga usando.',
      [
        ...pcs.slice(0, 5).map((pc) => ({ text: describirPc(pc), onPress: () => resolve(pc.id) })),
        { text: 'No, es un PC nuevo', onPress: () => resolve(null) },
        // Cerrar el aviso (o Esc) no vincula nada: así no se gasta un cupo sin querer.
        {
          text: 'Cancelar',
          style: 'cancel' as const,
          onPress: () => reject(new Error('Se canceló la vinculación de este PC.')),
        },
      ],
    );
  });
}

/** Opciones del equipo para vincularlo (solo en la web; en el teléfono, undefined). */
export function opcionesDeEquipo(nombre: string): OpcionesEquipo | undefined {
  if (!esPc) return undefined;
  return { nombre: nombre.trim() || 'PC', elegirReemplazo };
}
