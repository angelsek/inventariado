import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colores, radios } from '@/theme/colores';

type Props = {
  visible: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
};

/** Panel que sube desde abajo para ediciones rápidas (cantidad, descuento, monto...). */
export function Hoja({ visible, titulo, onCerrar, children }: Props) {
  // Deja libre el espacio de los botones del sistema en teléfonos de pantalla completa.
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <KeyboardAvoidingView behavior="padding" style={estilos.fondo}>
        <Pressable accessibilityLabel="Cerrar" style={estilos.cerrar} onPress={onCerrar} />
        <View style={[estilos.hoja, { paddingBottom: 32 + bottom }]}>
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
    borderTopLeftRadius: radios.grande,
    borderTopRightRadius: radios.grande,
    backgroundColor: colores.fondo,
  },
  titulo: { marginBottom: 16, fontSize: 22, fontWeight: '700', color: colores.texto },
});
