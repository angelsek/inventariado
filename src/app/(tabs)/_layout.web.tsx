import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { AvisoSuscripcion } from '@/features/suscripcion/AvisoSuscripcion';
import { ANCHO_PAGINA } from '@/navegacion/opcionesPantalla.web';
import { colores } from '@/theme/colores';
import { EncabezadoPagina, type PropsEncabezado } from '@/web/componentes/EncabezadoPagina.web';

// Pantallas del teléfono: centradas con ancho máximo para que no se estiren en el monitor.
const centrada = {
  sceneStyle: {
    width: '100%' as const,
    maxWidth: ANCHO_PAGINA,
    alignSelf: 'center' as const,
    backgroundColor: colores.fondo,
  },
};

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
          header: (props: PropsEncabezado) => <EncabezadoPagina {...props} />,
          sceneStyle: { backgroundColor: colores.fondo },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Resumen de hoy' }} />
        <Tabs.Screen name="inventario" options={{ title: 'Productos', ...centrada }} />
        <Tabs.Screen name="vender" options={{ title: 'Vender', headerShown: false }} />
        <Tabs.Screen name="caja" options={{ title: 'Caja del día', ...centrada }} />
        <Tabs.Screen name="mas" options={{ title: 'Cuenta y equipo' }} />
      </Tabs>
    </View>
  );
}
