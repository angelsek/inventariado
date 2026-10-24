import { ScrollView, StyleSheet, Text } from 'react-native';

import { CONTACTO } from '@/config';
import { colores } from '@/theme/colores';

/**
 * Cuerpo compartido de las páginas legales (términos, privacidad y cómo eliminar la cuenta).
 * El título de cada una vive en `src/app/_layout.tsx`, no acá.
 */
export function PantallaLegal({ texto }: { texto: string }) {
  const contacto = [CONTACTO.correo, CONTACTO.whatsapp].filter(Boolean).join(' · ');

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.texto}>{texto}</Text>
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
