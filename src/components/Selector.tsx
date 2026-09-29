import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colores } from '@/theme/colores';

type Opcion<T> = { valor: T; etiqueta: string };

type Props<T> = {
  opciones: Opcion<T>[];
  valor: T;
  onCambio: (valor: T) => void;
  /** En una fila desplazable (true) o en varias líneas (false). */
  horizontal?: boolean;
};

/** Grupo de "chips" para elegir una opción. */
export function Selector<T>({ opciones, valor, onCambio, horizontal }: Props<T>) {
  const chips = opciones.map((opcion) => {
    const activo = opcion.valor === valor;
    return (
      <Pressable
        key={String(opcion.valor)}
        accessibilityRole="button"
        accessibilityState={{ selected: activo }}
        onPress={() => onCambio(opcion.valor)}
        style={[estilos.chip, activo && estilos.chipActivo]}
      >
        <Text style={[estilos.texto, activo && estilos.textoActivo]}>{opcion.etiqueta}</Text>
      </Pressable>
    );
  });

  return horizontal ? (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={estilos.fila}
      keyboardShouldPersistTaps="handled"
    >
      {chips}
    </ScrollView>
  ) : (
    <ScrollView scrollEnabled={false} contentContainerStyle={[estilos.fila, estilos.envolver]}>
      {chips}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  envolver: { flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  texto: { fontSize: 15, color: colores.texto },
  textoActivo: { color: colores.superficie, fontWeight: '600' },
});
