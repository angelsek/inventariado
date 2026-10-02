import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colores } from '@/theme/colores';

import { useActualizacion } from './actualizacion';

/** Franja que avisa que hay una versión nueva del APK y la instala con un toque. */
export function AvisoActualizacion() {
  const nueva = useActualizacion((s) => s.nueva);
  const progreso = useActualizacion((s) => s.progreso);
  const actualizar = useActualizacion((s) => s.actualizar);
  if (!nueva) return null;

  const descargando = progreso !== null;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={descargando}
      onPress={actualizar}
      style={[estilos.franja, nueva.obligatoria && estilos.obligatoria]}
    >
      <View style={estilos.fila}>
        <Ionicons
          name={descargando ? 'cloud-download-outline' : 'arrow-up-circle-outline'}
          size={22}
          color={colores.superficie}
        />
        <Text style={estilos.texto}>
          {descargando
            ? `Descargando la versión nueva... ${Math.round(progreso * 100)} %`
            : `${nueva.obligatoria ? 'Actualización necesaria' : 'Hay una versión nueva'} (${nueva.version}).`}
        </Text>
        {descargando ? null : <Text style={estilos.boton}>Actualizar</Text>}
      </View>
      {descargando ? (
        <View style={estilos.barra}>
          <View style={[estilos.avance, { width: `${Math.round(progreso * 100)}%` }]} />
        </View>
      ) : null}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  franja: { paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colores.primario },
  obligatoria: { backgroundColor: colores.error },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  texto: { flex: 1, fontSize: 15, color: colores.superficie },
  boton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 15,
    fontWeight: '700',
    color: colores.primario,
    backgroundColor: colores.superficie,
  },
  barra: {
    height: 6,
    marginTop: 8,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  avance: { height: 6, backgroundColor: colores.superficie },
});
