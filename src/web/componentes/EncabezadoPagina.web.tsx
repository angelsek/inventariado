import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';
import { migaDe } from '@/web/navegacion/menu';

/** Lo que el encabezado usa de las props que le pasa el navegador (Stack o pestañas). */
export type PropsEncabezado = {
  options: {
    title?: string;
    headerRight?: (props: { tintColor?: string; canGoBack: boolean }) => ReactNode;
  };
  navigation: { canGoBack(): boolean; goBack(): void };
};

/**
 * Web (PC): encabezado de página de escritorio. Título a la izquierda y acciones de la pantalla a
 * la derecha. Las pantallas que cuelgan de una entrada del menú muestran la miga
 * ("Productos › Editar producto") en vez del botón Atrás del teléfono; las que no son del menú
 * (ingreso, crear cuenta) conservan la flecha para volver.
 */
export function EncabezadoPagina({ options, navigation }: PropsEncabezado) {
  const ruta = usePathname();
  const rol = useSesion((s) => (s.perfil?.rol === 'dueno' ? 'dueno' : 'cajero'));
  const conSesion = useSesion((s) => !!s.negocioId && !!s.perfil);
  const miga = conSesion ? migaDe(ruta, rol) : null;
  const titulo = options.title ?? '';
  const volver = !conSesion && navigation.canGoBack();

  return (
    <View style={estilos.encabezado}>
      {volver ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => navigation.goBack()}
          style={estilos.volver}
        >
          <Ionicons name="arrow-back" size={20} color={colores.texto} />
        </Pressable>
      ) : null}
      <View style={estilos.titulos}>
        {miga ? (
          <>
            <Text
              accessibilityRole="link"
              style={estilos.miga}
              onPress={() => router.navigate(miga.ruta as Href)}
            >
              {miga.texto}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colores.inactivo} />
          </>
        ) : null}
        <Text style={estilos.titulo} numberOfLines={1}>
          {titulo}
        </Text>
      </View>
      {options.headerRight ? (
        <View style={estilos.acciones}>
          {options.headerRight({ tintColor: colores.primario, canGoBack: navigation.canGoBack() })}
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  volver: { padding: 6, marginLeft: -6, borderRadius: 8 },
  titulos: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  miga: { fontSize: 16, color: colores.primario, fontWeight: '600' },
  titulo: { flexShrink: 1, fontSize: 20, fontWeight: '700', color: colores.texto },
  acciones: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
