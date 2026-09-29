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
  /**
   * Sigue leyendo después de cada código (para vender varios productos seguidos).
   * Ignora el mismo código durante un momento para no sumarlo dos veces.
   */
  continuo?: boolean;
  /** Texto a mostrar sobre la cámara (ej. el último producto agregado). */
  mensaje?: string | null;
};

const PAUSA_MS = 1500;

/** Cámara a pantalla completa que devuelve el primer código de barras leído. */
export function Escaner({ visible, onCodigo, onCerrar, continuo, mensaje }: Props) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  // La cámara informa el mismo código varias veces por segundo: solo se usa el primero.
  const leido = useRef(false);
  const ultimo = useRef<{ codigo: string; hora: number } | null>(null);

  const alMostrar = () => {
    leido.current = false;
    ultimo.current = null;
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
                const codigo = data?.trim();
                if (leido.current || !codigo) return;
                if (continuo) {
                  const ahora = Date.now();
                  if (ultimo.current?.codigo === codigo && ahora - ultimo.current.hora < PAUSA_MS)
                    return;
                  ultimo.current = { codigo, hora: ahora };
                } else {
                  leido.current = true;
                }
                onCodigo(codigo);
              }}
            />
            <View style={estilos.marco} pointerEvents="none" />
            <Text style={estilos.indicacion}>{mensaje ?? 'Apunta al código de barras'}</Text>
            {continuo ? (
              <View style={estilos.listo}>
                <Boton titulo="Listo" onPress={onCerrar} />
              </View>
            ) : null}
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
  indicacion: {
    marginTop: 24,
    marginHorizontal: 24,
    fontSize: 17,
    textAlign: 'center',
    color: colores.superficie,
  },
  listo: { position: 'absolute', bottom: 32, left: 24, right: 24 },
  sinPermiso: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 },
  textoPermiso: { fontSize: 17, textAlign: 'center', color: colores.superficie },
  cerrar: { position: 'absolute', top: 48, right: 20, padding: 8 },
});
