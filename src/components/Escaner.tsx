import Ionicons from '@expo/vector-icons/Ionicons';
import { type BarcodeType, CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  codigoValido,
  crearConfirmador,
  dentroDelMarco,
  type Rectangulo,
} from '@/features/escaner/lectura';
import { colores } from '@/theme/colores';

import { Boton } from './Boton';

// Códigos usados en productos de supermercado y botillería. Code 39 queda fuera:
// casi no se usa en productos y es el que más lecturas falsas produce.
const TIPOS: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'itf14'];

const ALTO_MARCO = 170;

/** Rectángulo de lectura: 80 % del ancho, un poco sobre el centro. */
function calcularMarco(ancho: number, alto: number): Rectangulo {
  return {
    x: ancho * 0.1,
    y: Math.max(0, (alto - ALTO_MARCO) / 2 - 40),
    ancho: ancho * 0.8,
    alto: ALTO_MARCO,
  };
}

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

/**
 * Cámara a pantalla completa que devuelve el primer código de barras leído.
 * Solo acepta códigos completos dentro del rectángulo, con dígito verificador
 * correcto y leídos igual varias veces (ver `features/escaner/lectura.ts`).
 */
export function Escaner({ visible, onCodigo, onCerrar, continuo, mensaje }: Props) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  // La cámara informa el mismo código varias veces por segundo: solo se usa el primero.
  const leido = useRef(false);
  const ultimo = useRef<{ codigo: string; hora: number } | null>(null);
  const confirmador = useRef(crearConfirmador());
  const [vista, setVista] = useState<Rectangulo | null>(null);
  const marco = vista ? calcularMarco(vista.ancho, vista.alto) : null;

  const alMostrar = () => {
    leido.current = false;
    ultimo.current = null;
    confirmador.current.reiniciar();
    if (permiso && !permiso.granted && permiso.canAskAgain) pedirPermiso();
  };

  return (
    <Modal visible={visible} animationType="slide" onShow={alMostrar} onRequestClose={onCerrar}>
      <SafeAreaView style={estilos.pantalla}>
        {permiso?.granted ? (
          <View
            style={estilos.camara}
            onLayout={({ nativeEvent: { layout } }) =>
              setVista({ x: 0, y: 0, ancho: layout.width, alto: layout.height })
            }
          >
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: TIPOS }}
              onBarcodeScanned={(lectura) => {
                const codigo = lectura.data?.trim();
                if (leido.current || !codigo) return;
                if (vista && marco && !dentroDelMarco(lectura, marco, vista)) return;
                if (!codigoValido(lectura.type, codigo)) return;
                if (!confirmador.current.leer(lectura.type, codigo)) return;
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
            {marco ? (
              <>
                {/* Oscurece todo lo que queda fuera del rectángulo de lectura. */}
                <View
                  pointerEvents="none"
                  style={[estilos.sombra, { top: 0, left: 0, right: 0, height: marco.y }]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    estilos.sombra,
                    { top: marco.y + marco.alto, left: 0, right: 0, bottom: 0 },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    estilos.sombra,
                    { top: marco.y, left: 0, width: marco.x, height: marco.alto },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    estilos.sombra,
                    { top: marco.y, right: 0, width: marco.x, height: marco.alto },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    estilos.marco,
                    { top: marco.y, left: marco.x, width: marco.ancho, height: marco.alto },
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[
                    estilos.linea,
                    { top: marco.y + marco.alto / 2, left: marco.x + 16, width: marco.ancho - 32 },
                  ]}
                />
              </>
            ) : null}
            <Text style={[estilos.indicacion, marco ? { top: marco.y + marco.alto + 20 } : null]}>
              {mensaje ?? 'Pon el código de barras dentro del rectángulo'}
            </Text>
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
  camara: { flex: 1 },
  sombra: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  marco: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: colores.superficie,
    borderRadius: 12,
  },
  linea: { position: 'absolute', height: 2, backgroundColor: '#E53935', opacity: 0.8 },
  indicacion: {
    position: 'absolute',
    left: 24,
    right: 24,
    fontSize: 17,
    textAlign: 'center',
    color: colores.superficie,
  },
  listo: { position: 'absolute', bottom: 32, left: 24, right: 24 },
  sinPermiso: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 },
  textoPermiso: { fontSize: 17, textAlign: 'center', color: colores.superficie },
  cerrar: { position: 'absolute', top: 48, right: 20, padding: 8 },
});
