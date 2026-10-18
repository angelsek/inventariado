import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { AvisoSuscripcion } from '@/features/suscripcion/AvisoSuscripcion';
import { colores } from '@/theme/colores';

// En el PC la app abre en la caja.
export const unstable_settings = { initialRouteName: 'vender' };

/**
 * Versión web (PC): las mismas pantallas que las pestañas del teléfono, pero sin barra de
 * pestañas: se navega con el menú lateral (web/componentes/MarcoApp.web.tsx).
 */
export default function TabsLayoutWeb() {
  return (
    <View style={{ flex: 1 }}>
      <AvisoSuscripcion />
      <Tabs
        screenOptions={{
          tabBarStyle: { display: 'none' },
          headerStyle: { backgroundColor: colores.superficie },
          headerTitleStyle: { color: colores.texto, fontSize: 20, fontWeight: '700' },
          headerShadowVisible: false,
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Resumen de hoy' }} />
        <Tabs.Screen name="inventario" options={{ title: 'Productos' }} />
        <Tabs.Screen name="vender" options={{ title: 'Vender', headerShown: false }} />
        <Tabs.Screen name="caja" options={{ title: 'Caja del día' }} />
        <Tabs.Screen name="mas" options={{ title: 'Cuenta y equipo' }} />
      </Tabs>
    </View>
  );
}
