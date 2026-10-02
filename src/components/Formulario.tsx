import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colores, radios } from '@/theme/colores';

type Props = {
  titulo: string;
  subtitulo?: string;
  error?: string | null;
  children: ReactNode;
};

/** Pantalla con título, mensaje de error opcional y contenido desplazable. */
export function Formulario({ titulo, subtitulo, error, children }: Props) {
  return (
    <SafeAreaView style={estilos.pantalla}>
      <KeyboardAvoidingView behavior="height" style={estilos.pantalla}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <Text style={estilos.titulo}>{titulo}</Text>
          {subtitulo ? <Text style={estilos.subtitulo}>{subtitulo}</Text> : null}
          {error ? (
            <View style={estilos.error} accessibilityRole="alert">
              <Text style={estilos.textoError}>{error}</Text>
            </View>
          ) : null}
          <View style={estilos.cuerpo}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 40 },
  cuerpo: { marginTop: 24 },
  titulo: { fontSize: 26, fontWeight: '700', color: colores.texto },
  subtitulo: { marginTop: 6, fontSize: 16, lineHeight: 22, color: colores.textoSecundario },
  error: {
    marginTop: 16,
    padding: 14,
    borderRadius: radios.chico,
    backgroundColor: colores.fondoError,
  },
  textoError: { fontSize: 15, color: colores.error },
});
