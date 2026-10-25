import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colores } from '@/theme/colores';

/**
 * Pantalla para una dirección que no existe. En la web la app es una sola página
 * (`web.output: "single"` en app.json), así que el servidor igual responde 200:
 * este aviso es lo que distingue una dirección equivocada de una página real.
 */
export default function NoEncontradoScreen() {
  return (
    <View style={estilos.pantalla}>
      <Text style={estilos.titulo}>No encontramos esa página</Text>
      <Text style={estilos.texto}>
        La dirección que abriste no existe o cambió de nombre. Revisa que esté bien escrita.
      </Text>
      <Link href="/" style={estilos.enlace}>
        Volver al inicio
      </Link>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  titulo: { fontSize: 22, fontWeight: '600', color: colores.texto, textAlign: 'center' },
  texto: { fontSize: 16, lineHeight: 22, color: colores.textoSecundario, textAlign: 'center' },
  enlace: { marginTop: 8, fontSize: 17, color: colores.primario },
});
