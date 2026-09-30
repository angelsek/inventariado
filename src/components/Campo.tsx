import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colores, radios } from '@/theme/colores';

type Props = TextInputProps & {
  etiqueta: string;
  error?: string | null;
  ayuda?: string;
};

export function Campo({ etiqueta, error, ayuda, style, ...props }: Props) {
  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <TextInput
        accessibilityLabel={etiqueta}
        placeholderTextColor={colores.inactivo}
        style={[estilos.entrada, !!error && estilos.entradaError, style]}
        {...props}
      />
      {error ? (
        <Text style={estilos.error}>{error}</Text>
      ) : ayuda ? (
        <Text style={estilos.ayuda}>{ayuda}</Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { marginBottom: 16 },
  etiqueta: { marginBottom: 6, fontSize: 15, fontWeight: '600', color: colores.texto },
  entrada: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radios.chico,
    paddingHorizontal: 14,
    fontSize: 17,
    color: colores.texto,
    backgroundColor: colores.superficie,
  },
  entradaError: { borderColor: colores.error },
  error: { marginTop: 4, fontSize: 14, color: colores.error },
  ayuda: { marginTop: 4, fontSize: 14, color: colores.textoSecundario },
});
