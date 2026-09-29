import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AJUSTE_NEGOCIO, leerAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos, NOMBRE_BASE_DE_DATOS } from '@/db/migraciones';
import { useSesion } from '@/sesion/store';
import { useSincronizacionAutomatica } from '@/sync/useSincronizacionAutomatica';
import { colores } from '@/theme/colores';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={NOMBRE_BASE_DE_DATOS} onInit={migrarBaseDeDatos}>
      <StatusBar style="dark" />
      <Navegacion />
    </SQLiteProvider>
  );
}

/**
 * Decide qué pantallas están disponibles según el estado de la sesión:
 *   sin negocio vinculado -> bienvenida, crear cuenta, ingresar
 *   con negocio, sin perfil -> elegir usuario e ingresar PIN
 *   con perfil -> la app
 */
function Navegacion() {
  const db = useSQLiteContext();
  const { cargada, negocioId, perfil, cargar } = useSesion();

  useEffect(() => {
    leerAjuste(db, AJUSTE_NEGOCIO).then(cargar);
  }, [db, cargar]);

  useEffect(() => {
    if (cargada) SplashScreen.hideAsync();
  }, [cargada]);

  useSincronizacionAutomatica();

  const conEncabezado = (title: string) => ({
    headerShown: true,
    title,
    headerStyle: { backgroundColor: colores.superficie },
  });

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!negocioId}>
        <Stack.Screen name="bienvenida" />
        <Stack.Screen name="crear-cuenta" options={conEncabezado('Crear cuenta')} />
        <Stack.Screen name="ingresar" options={conEncabezado('Iniciar sesión')} />
        <Stack.Screen name="crear-negocio" options={conEncabezado('Datos del negocio')} />
      </Stack.Protected>

      <Stack.Protected guard={!!negocioId && !perfil}>
        <Stack.Screen name="pin" />
      </Stack.Protected>

      <Stack.Protected guard={!!negocioId && !!perfil}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="usuarios" options={conEncabezado('Usuarios')} />
        <Stack.Screen name="producto/[id]" options={conEncabezado('Producto')} />
        <Stack.Screen name="categorias" options={conEncabezado('Categorías')} />
        <Stack.Screen name="importar" options={conEncabezado('Importar productos')} />
        <Stack.Screen name="cobrar" options={conEncabezado('Cobrar')} />
        <Stack.Screen name="ventas" options={conEncabezado('Ventas')} />
        <Stack.Screen name="venta/[id]" options={conEncabezado('Venta')} />
      </Stack.Protected>
    </Stack>
  );
}
