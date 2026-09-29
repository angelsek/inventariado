import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { useActualizacion } from '@/features/actualizacion/actualizacion';
import { AvisoActualizacion } from '@/features/actualizacion/AvisoActualizacion';
import { AvisoSuscripcion } from '@/features/suscripcion/AvisoSuscripcion';
import { avisoSuscripcion } from '@/features/suscripcion/estado';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

function icono(nombre: NombreIcono) {
  return function IconoPestana({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={nombre} color={color} size={size} />;
  };
}

export default function TabsLayout() {
  const suscripcion = useSesion((s) => s.suscripcion);
  const hayActualizacion = useActualizacion((s) => s.nueva !== null);
  const hayAviso = hayActualizacion || (!!suscripcion && avisoSuscripcion(suscripcion) !== null);
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
          headerStyle: { backgroundColor: colores.superficie },
          headerTitleStyle: { color: colores.texto },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: 'Vender', tabBarIcon: icono('cart-outline') }}
        />
        <Tabs.Screen
          name="inventario"
          options={{ title: 'Inventario', tabBarIcon: icono('cube-outline') }}
        />
        <Tabs.Screen name="caja" options={{ title: 'Caja', tabBarIcon: icono('cash-outline') }} />
        <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: icono('menu-outline') }} />
      </Tabs>
    </View>
  );
}
