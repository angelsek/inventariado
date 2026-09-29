import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AJUSTE_NEGOCIO, leerAjuste } from '@/db/ajustes';
import { migrarBaseDeDatos, NOMBRE_BASE_DE_DATOS } from '@/db/migraciones';
import { obtenerEstadoSuscripcion } from '@/db/suscripcion';
import { useActualizacion } from '@/features/actualizacion/actualizacion';
import { informarError, instalarManejadorErrores } from '@/lib/errores';
import { useSesion } from '@/sesion/store';
import { useSincronizacionAutomatica } from '@/sync/useSincronizacionAutomatica';
import { colores } from '@/theme/colores';

SplashScreen.preventAutoHideAsync();
instalarManejadorErrores();

/**
 * Pantalla de error de Expo Router: si una pantalla falla, se informa el error
 * al administrador y se ofrece reintentar en vez de cerrar la app.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => {
    informarError(error, 'Pantalla');
  }, [error]);

  return (
    <ScrollView contentContainerStyle={estilosError.contenedor}>
      <Text style={estilosError.titulo}>Algo salió mal</Text>
      <Text style={estilosError.texto}>
        El error se informó automáticamente. Tus datos están guardados en el teléfono.
      </Text>
      <Text style={estilosError.detalle}>{error.message}</Text>
      <View style={estilosError.boton}>
        <Text accessibilityRole="button" style={estilosError.reintentar} onPress={retry}>
          Reintentar
        </Text>
      </View>
    </ScrollView>
  );
}

const estilosError = StyleSheet.create({
  contenedor: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colores.fondo,
  },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.texto },
  texto: { marginTop: 8, fontSize: 16, color: colores.textoSecundario },
  detalle: { marginTop: 16, fontSize: 13, color: colores.error },
  boton: { marginTop: 24 },
  reintentar: { fontSize: 17, fontWeight: '600', color: colores.primario },
});

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
  const { cargada, negocioId, perfil, cargar, fijarSuscripcion } = useSesion();

  useEffect(() => {
    leerAjuste(db, AJUSTE_NEGOCIO).then(async (id) => {
      if (id) fijarSuscripcion(await obtenerEstadoSuscripcion(db, id));
      cargar(id);
    });
  }, [db, cargar, fijarSuscripcion]);

  useEffect(() => {
    if (cargada) SplashScreen.hideAsync();
  }, [cargada]);

  const verificarActualizacion = useActualizacion((s) => s.verificar);
  useEffect(() => {
    verificarActualizacion();
  }, [verificarActualizacion]);

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
        <Stack.Screen name="compra" options={conEncabezado('Ingreso de mercadería')} />
        <Stack.Screen name="compras" options={conEncabezado('Ingresos anteriores')} />
        <Stack.Screen name="proveedores" options={conEncabezado('Proveedores')} />
        <Stack.Screen name="reponer" options={conEncabezado('Por reponer')} />
        <Stack.Screen name="conteo" options={conEncabezado('Conteo de inventario')} />
        <Stack.Screen name="suscripcion" options={conEncabezado('Suscripción')} />
        <Stack.Screen name="admin" options={conEncabezado('Administración')} />
        <Stack.Screen name="reportes" options={conEncabezado('Reportes')} />
        <Stack.Screen name="exportar" options={conEncabezado('Exportar datos')} />
        <Stack.Screen name="comentario" options={conEncabezado('Enviar comentario')} />
        <Stack.Screen name="eliminar-cuenta" options={conEncabezado('Eliminar cuenta')} />
      </Stack.Protected>

      {/*
        Términos y privacidad: se pueden leer antes y después de iniciar sesión.
        Va al final: si una ruta protegida no está disponible, se abre la primera
        de la lista que sí lo esté, y no debe ser esta.
      */}
      <Stack.Screen name="legal/[doc]" options={conEncabezado('')} />
    </Stack>
  );
}
