import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colores } from '@/theme/colores';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

function icono(nombre: NombreIcono) {
  return function IconoPestana({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={nombre} color={color} size={size} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.inactivo,
        headerStyle: { backgroundColor: colores.superficie },
        headerTitleStyle: { color: colores.texto },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Vender', tabBarIcon: icono('cart-outline') }} />
      <Tabs.Screen
        name="inventario"
        options={{ title: 'Inventario', tabBarIcon: icono('cube-outline') }}
      />
      <Tabs.Screen name="caja" options={{ title: 'Caja', tabBarIcon: icono('cash-outline') }} />
      <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: icono('menu-outline') }} />
    </Tabs>
  );
}
