import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLectorCodigos } from '@/features/escaner/useLectorCodigos';
import { colores, radios } from '@/theme/colores';

import { Boton } from './Boton';

type Props = {
  visible: boolean;
  onCodigo: (codigo: string) => void;
  onCerrar: () => void;
  continuo?: boolean;
  mensaje?: string | null;
};

const PAUSA_MS = 1500;

/**
 * Escritorio: en vez de la cámara, espera el código de la pistola lectora USB.
 * Misma interfaz que Escaner.tsx, para que las pantallas no cambien.
 */
export function Escaner({ visible, onCodigo, onCerrar, continuo, mensaje }: Props) {
  const ultimo = useRef<{ codigo: string; hora: number } | null>(null);

  useLectorCodigos((codigo) => {
    if (continuo) {
      const ahora = Date.now();
      if (ultimo.current?.codigo === codigo && ahora - ultimo.current.hora < PAUSA_MS) return;
      ultimo.current = { codigo, hora: ahora };
    }
    onCodigo(codigo);
  }, visible);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={estilos.fondo}>
        <View style={estilos.tarjeta}>
          <Ionicons name="barcode-outline" size={56} color={colores.primario} />
          <Text style={estilos.titulo}>Lee el código con la pistola</Text>
          <Text style={estilos.texto}>
            {mensaje ?? 'Apunta la pistola lectora al código de barras del producto.'}
          </Text>
          <Boton titulo={continuo ? 'Listo' : 'Cancelar'} onPress={onCerrar} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar lector"
          onPress={onCerrar}
          style={estilos.cerrar}
        >
          <Ionicons name="close" size={32} color={colores.superficie} />
        </Pressable>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  tarjeta: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 16,
    padding: 28,
    borderRadius: radios.grande,
    backgroundColor: colores.superficie,
  },
  titulo: { fontSize: 22, fontWeight: '700', color: colores.texto, textAlign: 'center' },
  texto: { fontSize: 16, color: colores.textoSecundario, textAlign: 'center' },
  cerrar: { position: 'absolute', top: 24, right: 24, padding: 8 },
});
