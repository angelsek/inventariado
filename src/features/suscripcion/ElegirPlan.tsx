import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoStockeao } from '@/components/LogoStockeao';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

import { PlanesPlay } from './PlanesPlay';

/**
 * Versión de Play: un negocio sin plan elige uno antes de usar la app. La prueba
 * gratis la da Google (con la tarjeta registrada), así el cobro parte solo.
 */
export function ElegirPlan() {
  const salir = useSesion((s) => s.salir);
  return (
    <SafeAreaView style={estilos.pantalla}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <View style={estilos.logo}>
          <LogoStockeao tamano={84} />
        </View>
        <Text style={estilos.titulo}>Elige tu plan</Text>
        <Text style={estilos.subtitulo}>
          Prueba Stockeao gratis por 7 días. Si no te convence, cancelas desde Play Store y no pagas
          nada.
        </Text>
        <PlanesPlay />
        <Text accessibilityRole="button" style={estilos.enlace} onPress={salir}>
          Cambiar de usuario
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 40 },
  logo: { alignSelf: 'center' },
  titulo: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '700',
    color: colores.texto,
  },
  subtitulo: {
    marginTop: 8,
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 23,
    color: colores.textoSecundario,
  },
  enlace: { marginTop: 24, textAlign: 'center', fontSize: 16, color: colores.primario },
});
