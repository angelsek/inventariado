import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import {
  type ColorValue,
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';

import { CANAL } from '@/config';
import { useActualizacion } from '@/features/actualizacion/actualizacion';
import { AvisoActualizacion } from '@/features/actualizacion/AvisoActualizacion';
import { AvisoSuscripcion } from '@/features/suscripcion/AvisoSuscripcion';
import { ElegirPlan } from '@/features/suscripcion/ElegirPlan';
import { avisoSuscripcion } from '@/features/suscripcion/estado';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

function icono(nombre: NombreIcono) {
  return function IconoPestana({ color }: { color: ColorValue; size: number }) {
    return <Ionicons name={nombre} color={color} size={28} />;
  };
}

/** Botón grande y redondo al centro de la barra: vender es lo que más se usa. */
type PropsBotonPestana = {
  onPress?: (e: GestureResponderEvent) => void;
  'aria-selected'?: boolean;
};

function BotonVender({ onPress, 'aria-selected': activo }: PropsBotonPestana) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Vender"
      accessibilityState={{ selected: !!activo }}
      onPress={onPress}
      style={estilos.vender}
    >
      <View style={[estilos.circulo, activo && estilos.circuloActivo]}>
        <Ionicons name="cart" size={30} color={colores.superficie} />
      </View>
      <Text style={[estilos.textoVender, activo && estilos.textoVenderActivo]}>Vender</Text>
    </Pressable>
  );
}

export default function TabsLayout() {
  const suscripcion = useSesion((s) => s.suscripcion);
  const hayActualizacion = useActualizacion((s) => s.nueva !== null);
  const hayAviso = hayActualizacion || (!!suscripcion && avisoSuscripcion(suscripcion) !== null);
  // Espacio de los botones del sistema (atrás, inicio...), distinto en cada teléfono:
  // 0 con gestos en algunos modelos, ~48 px con la barra de tres botones.
  const { bottom } = useSafeAreaInsets();

  // Versión de Play: un negocio que nunca ha pagado (solo la prueba sin tarjeta
  // del servidor) elige plan primero; la prueba de 14 días la da Google.
  if (CANAL === 'play' && suscripcion?.estado === 'prueba') return <ElegirPlan />;
  return (
    <View style={{ flex: 1 }}>
      {hayAviso ? (
        <SafeAreaView edges={['top']} style={{ backgroundColor: colores.superficie }}>
          <AvisoActualizacion />
          <AvisoSuscripcion />
        </SafeAreaView>
      ) : null}
      <Tabs
        screenOptions={{
          // Con aviso, el aviso ya ocupa la zona de la barra de estado.
          ...(hayAviso ? { headerStatusBarHeight: 0 } : {}),
          tabBarActiveTintColor: colores.primario,
          tabBarInactiveTintColor: colores.inactivo,
          tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
          tabBarStyle: {
            height: 66 + bottom,
            paddingTop: 6,
            paddingBottom: Math.max(bottom, 8),
            borderTopColor: colores.borde,
          },
          headerStyle: { backgroundColor: colores.superficie },
          headerTitleStyle: { color: colores.texto, fontSize: 20, fontWeight: '700' },
          headerShadowVisible: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Inicio', tabBarIcon: icono('home-outline') }}
        />
        <Tabs.Screen
          name="inventario"
          options={{ title: 'Productos', tabBarIcon: icono('cube-outline') }}
        />
        <Tabs.Screen
          name="vender"
          options={{
            title: 'Vender',
            tabBarButton: (props) => <BotonVender {...(props as PropsBotonPestana)} />,
          }}
        />
        <Tabs.Screen name="caja" options={{ title: 'Caja', tabBarIcon: icono('cash-outline') }} />
        <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: icono('menu-outline') }} />
      </Tabs>
    </View>
  );
}

const estilos = StyleSheet.create({
  vender: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 },
  circulo: {
    width: 62,
    height: 62,
    marginTop: -26,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primario,
    borderWidth: 4,
    borderColor: colores.superficie,
    elevation: 4,
  },
  circuloActivo: { backgroundColor: '#163A33' },
  textoVender: { marginTop: 2, fontSize: 13, fontWeight: '700', color: colores.primario },
  textoVenderActivo: { color: '#163A33' },
});
