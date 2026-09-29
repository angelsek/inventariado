import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colores } from '@/theme/colores';

type Props = {
  titulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario' | 'peligro';
  cargando?: boolean;
  deshabilitado?: boolean;
};

export function Boton({ titulo, onPress, variante = 'primario', cargando, deshabilitado }: Props) {
  const inactivo = cargando || deshabilitado;
  const primario = variante === 'primario';
  const colorTexto = primario
    ? colores.superficie
    : variante === 'peligro'
      ? colores.error
      : colores.primario;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactivo }}
      disabled={inactivo}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.base,
        primario ? estilos.primario : estilos.secundario,
        variante === 'peligro' && estilos.peligro,
        (pressed || inactivo) && estilos.presionado,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={colorTexto} />
      ) : (
        <Text style={[estilos.texto, { color: colorTexto }]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    minHeight: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primario: { backgroundColor: colores.primario },
  secundario: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.primario,
  },
  peligro: { borderColor: colores.error },
  presionado: { opacity: 0.6 },
  texto: { fontSize: 16, fontWeight: '600' },
});
