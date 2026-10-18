import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colores, radios } from '@/theme/colores';

/**
 * Accesos de la pantalla Productos en el teléfono (fila deslizable, solo el dueño).
 * En el PC, ver AccionesInventario.web.tsx (barra de herramientas sin los accesos del menú).
 */
export function AccionesInventario({ esDueno }: { esDueno: boolean }) {
  if (!esDueno) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={estilos.accionesScroll}
      contentContainerStyle={estilos.acciones}
    >
      <Accion icono="download-outline" texto="Ingreso" onPress={() => router.push('/compra')} />
      <Accion
        icono="alert-circle-outline"
        texto="Reponer"
        onPress={() => router.push('/reponer')}
      />
      <Accion icono="clipboard-outline" texto="Conteo" onPress={() => router.push('/conteo')} />
      <Accion
        icono="pricetags-outline"
        texto="Categorías"
        onPress={() => router.push('/categorias')}
      />
      <Accion
        icono="people-outline"
        texto="Proveedores"
        onPress={() => router.push('/proveedores')}
      />
      <Accion
        icono="document-text-outline"
        texto="Importar"
        onPress={() => router.push('/importar')}
      />
    </ScrollView>
  );
}

/** Botón flotante "Nuevo producto" del teléfono (en el PC está en la barra de herramientas). */
export function BotonNuevoProducto({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nuevo producto"
      onPress={() => router.push('/producto/nuevo')}
      style={({ pressed }) => [estilos.flotante, pressed && estilos.presionada]}
    >
      <Ionicons name="add" size={28} color={colores.superficie} />
      <Text style={estilos.textoFlotante}>Nuevo producto</Text>
    </Pressable>
  );
}

function Accion({
  icono,
  texto,
  onPress,
}: {
  icono: ComponentProps<typeof Ionicons>['name'];
  texto: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={estilos.accion}>
      <Ionicons name={icono} size={18} color={colores.primario} />
      <Text style={estilos.textoAccion}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  accionesScroll: { flexGrow: 0, flexShrink: 0 },
  acciones: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  accion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radios.pastilla,
    backgroundColor: colores.primarioSuave,
  },
  textoAccion: { fontSize: 15, fontWeight: '600', color: colores.primario },
  presionada: { opacity: 0.6 },
  flotante: {
    position: 'absolute',
    right: 16,
    // Más arriba que la barra para no topar con el botón Vender, que sobresale.
    bottom: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 18,
    paddingRight: 22,
    minHeight: 60,
    borderRadius: radios.pastilla,
    backgroundColor: colores.primario,
    elevation: 6,
  },
  textoFlotante: { fontSize: 18, fontWeight: '700', color: colores.superficie },
});
