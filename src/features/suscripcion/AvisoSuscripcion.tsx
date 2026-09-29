import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

import { avisoSuscripcion } from './estado';

/** Franja arriba de la app cuando la prueba o la suscripción están por vencer o vencidas. */
export function AvisoSuscripcion() {
  const suscripcion = useSesion((s) => s.suscripcion);
  const aviso = suscripcion ? avisoSuscripcion(suscripcion) : null;
  if (!aviso) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/suscripcion')}
      style={[estilos.franja, aviso.grave ? estilos.grave : estilos.leve]}
    >
      <Ionicons
        name={aviso.grave ? 'alert-circle' : 'time-outline'}
        size={18}
        color={aviso.grave ? colores.error : colores.aviso}
      />
      <Text style={[estilos.texto, { color: aviso.grave ? colores.error : colores.aviso }]}>
        {aviso.texto}
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
  },
  grave: { backgroundColor: colores.fondoError },
  leve: { backgroundColor: '#FFF3E0' },
  texto: { flex: 1, fontSize: 14 },
});
