import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LARGO_PIN } from '@/lib/pin';
import { colores } from '@/theme/colores';

type Props = {
  valor: string;
  onCambio: (valor: string) => void;
  deshabilitado?: boolean;
};

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'borrar'];

/** Puntos del PIN ingresado y teclado numérico grande. */
export function TecladoPin({ valor, onCambio, deshabilitado }: Props) {
  const presionar = (tecla: string) => {
    if (tecla === 'borrar') onCambio(valor.slice(0, -1));
    else if (valor.length < LARGO_PIN) onCambio(valor + tecla);
  };

  return (
    <View>
      <View style={estilos.puntos} accessibilityLabel={`${valor.length} de ${LARGO_PIN} dígitos`}>
        {Array.from({ length: LARGO_PIN }, (_, i) => (
          <View key={i} style={[estilos.punto, i < valor.length && estilos.puntoLleno]} />
        ))}
      </View>
      <View style={estilos.teclado}>
        {TECLAS.map((tecla, i) =>
          tecla === '' ? (
            <View key={i} style={estilos.tecla} />
          ) : (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={tecla === 'borrar' ? 'Borrar' : tecla}
              disabled={deshabilitado}
              onPress={() => presionar(tecla)}
              style={({ pressed }) => [estilos.tecla, pressed && estilos.teclaPresionada]}
            >
              {tecla === 'borrar' ? (
                <Ionicons name="backspace-outline" size={28} color={colores.texto} />
              ) : (
                <Text style={estilos.textoTecla}>{tecla}</Text>
              )}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  puntos: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginVertical: 24 },
  punto: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colores.primario,
  },
  puntoLleno: { backgroundColor: colores.primario },
  teclado: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  tecla: {
    width: '33%',
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
  },
  teclaPresionada: { backgroundColor: colores.borde },
  textoTecla: { fontSize: 28, fontWeight: '500', color: colores.texto },
});
