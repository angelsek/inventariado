import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colores } from '@/theme/colores';

type Props = {
  visible: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
};

/** Panel que sube desde abajo para ediciones rápidas (cantidad, descuento, monto...). */
export function Hoja({ visible, titulo, onCerrar, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView behavior="padding" style={estilos.fondo}>
        <Pressable accessibilityLabel="Cerrar" style={estilos.cerrar} onPress={onCerrar} />
        <View style={estilos.hoja}>
          <Text style={estilos.titulo}>{titulo}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  cerrar: { flex: 1 },
  hoja: {
    padding: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colores.fondo,
  },
  titulo: { marginBottom: 16, fontSize: 20, fontWeight: '700', color: colores.texto },
});
