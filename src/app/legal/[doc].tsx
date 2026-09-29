import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { CONTACTO } from '@/config';
import { PRIVACIDAD, TERMINOS } from '@/legal/textos';
import { colores } from '@/theme/colores';

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const esPrivacidad = doc === 'privacidad';
  const contacto = [CONTACTO.correo, CONTACTO.whatsapp].filter(Boolean).join(' · ');

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Stack.Screen options={{ title: esPrivacidad ? 'Privacidad' : 'Términos' }} />
      <Text style={estilos.texto}>{esPrivacidad ? PRIVACIDAD : TERMINOS}</Text>
      {contacto ? <Text style={estilos.contacto}>Contacto: {contacto}</Text> : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 40 },
  texto: { fontSize: 15, lineHeight: 22, color: colores.texto },
  contacto: { marginTop: 20, fontSize: 15, color: colores.textoSecundario },
});
