import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton } from '@/components/Boton';
import { supabaseConfigurado } from '@/lib/supabase';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

export default function BienvenidaScreen() {
  const avisoSalida = useSesion((s) => s.avisoSalida);
  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.encabezado}>
        <Ionicons name="storefront-outline" size={72} color={colores.primario} />
        <Text style={estilos.titulo}>Stockeao</Text>
        <Text style={estilos.subtitulo}>Inventario y ventas para tu almacén o botillería</Text>
      </View>

      {avisoSalida ? <Text style={estilos.aviso}>{avisoSalida}</Text> : null}

      {!supabaseConfigurado ? (
        <Text style={estilos.aviso}>
          Esta versión se construyó sin conexión al servidor. No se puede crear cuentas ni iniciar
          sesión.
        </Text>
      ) : null}

      <View style={estilos.acciones}>
        <Boton
          titulo="Crear mi negocio"
          onPress={() => router.push('/crear-cuenta')}
          deshabilitado={!supabaseConfigurado}
        />
        <Boton
          titulo="Ya tengo cuenta"
          variante="secundario"
          onPress={() => router.push('/ingresar')}
          deshabilitado={!supabaseConfigurado}
        />
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, padding: 24, backgroundColor: colores.fondo },
  encabezado: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titulo: { marginTop: 16, fontSize: 32, fontWeight: '700', color: colores.texto },
  subtitulo: {
    marginTop: 8,
    fontSize: 16,
    textAlign: 'center',
    color: colores.textoSecundario,
  },
  aviso: { marginBottom: 16, fontSize: 14, textAlign: 'center', color: colores.error },
  acciones: { gap: 12 },
});
