import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colores } from '@/theme/colores';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

/**
 * Web (PC): barra de herramientas de Productos. Solo lo propio del catálogo: Ingresos, Conteo y
 * Proveedores ya están en el menú lateral (un solo camino a cada pantalla).
 */
export function AccionesInventario({ esDueno }: { esDueno: boolean }) {
  if (!esDueno) return null;
  return (
    <View style={estilos.barra}>
      <Herramienta icono="add" texto="Nuevo producto" ruta="/producto/nuevo" principal />
      <Herramienta icono="alert-circle-outline" texto="Por reponer" ruta="/reponer" />
      <Herramienta icono="pricetags-outline" texto="Categorías" ruta="/categorias" />
      <Herramienta icono="document-text-outline" texto="Importar" ruta="/importar" />
    </View>
  );
}

/** En el PC "Nuevo producto" está en la barra de herramientas: sin botón flotante. */
export function BotonNuevoProducto(_props: { visible: boolean }) {
  return null;
}

function Herramienta({
  icono,
  texto,
  ruta,
  principal,
}: {
  icono: NombreIcono;
  texto: string;
  ruta: Href;
  principal?: boolean;
}) {
  const color = principal ? colores.superficie : colores.primario;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(ruta)}
      style={[estilos.herramienta, principal && estilos.principal]}
    >
      <Ionicons name={icono} size={17} color={color} />
      <Text style={[estilos.texto, { color }]}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  herramienta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  principal: { borderColor: colores.primario, backgroundColor: colores.primario },
  texto: { fontSize: 15, fontWeight: '600' },
});
