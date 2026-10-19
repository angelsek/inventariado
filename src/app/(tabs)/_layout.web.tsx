import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { puedeAbrir } from '@/features/permisos/permisos';
import { AvisoSuscripcion } from '@/features/suscripcion/AvisoSuscripcion';
import { usePermisos } from '@/sesion/permisos';
import { colores } from '@/theme/colores';

// En el PC la app abre en la caja.
export const unstable_settings = { initialRouteName: 'vender' };

/**
 * Versión web (PC): las mismas pantallas que las pestañas del teléfono, pero sin barra de
 * pestañas: se navega con el menú lateral (web/componentes/MarcoApp.web.tsx).
 */
export default function TabsLayoutWeb() {
  const permisos = usePermisos();
  const puede = (ruta: string) => puedeAbrir(ruta, permisos);
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
        <Tabs.Protected guard={puede('/vender')}>
          <Tabs.Screen name="vender" options={{ title: 'Vender', headerShown: false }} />
        </Tabs.Protected>
        <Tabs.Protected guard={puede('/caja')}>
          <Tabs.Screen name="caja" options={{ title: 'Caja del día' }} />
        </Tabs.Protected>
        <Tabs.Screen name="mas" options={{ title: 'Cuenta y equipo' }} />
      </Tabs>
    </View>
  );
}
