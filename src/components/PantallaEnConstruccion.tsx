import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colores } from '@/theme/colores';

type Props = {
  icono: ComponentProps<typeof Ionicons>['name'];
  titulo: string;
  descripcion: string;
};

export function PantallaEnConstruccion({ icono, titulo, descripcion }: Props) {
  return (
    <View style={estilos.contenedor}>
      <Ionicons name={icono} size={64} color={colores.inactivo} />
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.descripcion}>{descripcion}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colores.fondo,
  },
  titulo: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '600',
    color: colores.texto,
  },
  descripcion: {
    marginTop: 8,
    fontSize: 15,
    textAlign: 'center',
    color: colores.textoSecundario,
  },
});
