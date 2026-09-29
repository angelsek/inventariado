import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';

import { colores } from '@/theme/colores';

import { useActualizacion } from './actualizacion';

/** Franja que invita a descargar la versión nueva del APK. */
export function AvisoActualizacion() {
  const nueva = useActualizacion((s) => s.nueva);
  if (!nueva) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => Linking.openURL(nueva.url)}
      style={[estilos.franja, nueva.obligatoria && estilos.obligatoria]}
    >
      <Ionicons name="cloud-download-outline" size={18} color={colores.superficie} />
      <Text style={estilos.texto}>
        {nueva.obligatoria ? 'Actualización necesaria' : 'Hay una versión nueva'} ({nueva.version}).
        Toca para descargarla.
      </Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  franja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colores.primario,
  },
  obligatoria: { backgroundColor: colores.error },
  texto: { flex: 1, fontSize: 14, color: colores.superficie },
});
