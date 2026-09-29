import Ionicons from '@expo/vector-icons/Ionicons';
import { type BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colores } from '@/theme/colores';

import { Boton } from './Boton';

// Códigos usados en productos de supermercado y botillería.
const TIPOS: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'];

type Props = {
  visible: boolean;
  onCodigo: (codigo: string) => void;
  onCerrar: () => void;
};

/** Cámara a pantalla completa que devuelve el primer código de barras leído. */
export function Escaner({ visible, onCodigo, onCerrar }: Props) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  // La cámara informa el mismo código varias veces por segundo: solo se usa el primero.
  const leido = useRef(false);

  const alMostrar = () => {
    leido.current = false;
    if (permiso && !permiso.granted && permiso.canAskAgain) pedirPermiso();
  };

  return (
    <Modal visible={visible} animationType="slide" onShow={alMostrar} onRequestClose={onCerrar}>
      <SafeAreaView style={estilos.pantalla}>
        {permiso?.granted ? (
          <View style={estilos.camara}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: TIPOS }}
              onBarcodeScanned={({ data }) => {
                if (leido.current || !data) return;
                leido.current = true;
                onCodigo(data.trim());
              }}
            />
            <View style={estilos.marco} pointerEvents="none" />
            <Text style={estilos.indicacion}>Apunta al código de barras</Text>
          </View>
        ) : (
          <View style={estilos.sinPermiso}>
            <Ionicons name="camera-outline" size={56} color={colores.superficie} />
            <Text style={estilos.textoPermiso}>
              Para escanear códigos, la app necesita usar la cámara.
            </Text>
            <Boton titulo="Permitir cámara" onPress={pedirPermiso} />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar escáner"
          onPress={onCerrar}
          style={estilos.cerrar}
        >
          <Ionicons name="close" size={32} color={colores.superficie} />
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#000' },
  camara: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  marco: {
    width: '80%',
    height: 160,
    borderWidth: 3,
    borderColor: colores.superficie,
    borderRadius: 16,
  },
  indicacion: { marginTop: 24, fontSize: 17, color: colores.superficie },
  sinPermiso: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 },
  textoPermiso: { fontSize: 17, textAlign: 'center', color: colores.superficie },
  cerrar: { position: 'absolute', top: 48, right: 20, padding: 8 },
});
