import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { versionActual } from '@/lib/version';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

/** Sugerencias o problemas que llegan al administrador de la app. */
export default function ComentarioScreen() {
  const { negocioId, perfil } = useSesion();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    setError(null);
    const { error: e } = await supabase.rpc('enviar_comentario', {
      p_negocio_id: negocioId,
      p_texto: texto,
      p_perfil: perfil?.nombre ?? null,
      p_version: versionActual().texto,
    });
    setEnviando(false);
    if (e) return setError(`No se pudo enviar (se necesita internet). ${mensajeDeError(e)}`);
    setEnviado(true);
    setTexto('');
  };

  return (
    <Formulario
      titulo="Enviar comentario"
      subtitulo="Cuéntanos qué mejorar, qué falta o qué problema tuviste. Lo leemos todo."
      error={error}
    >
      {enviado ? (
        <>
          <Text style={estilos.ok}>¡Gracias! Recibimos tu comentario.</Text>
          <Boton titulo="Volver" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <TextInput
            accessibilityLabel="Comentario"
            multiline
            placeholder="Escribe aquí…"
            placeholderTextColor={colores.inactivo}
            value={texto}
            onChangeText={setTexto}
            style={estilos.entrada}
          />
          <Boton
            titulo="Enviar"
            onPress={enviar}
            cargando={enviando}
            deshabilitado={!texto.trim()}
          />
        </>
      )}
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  entrada: {
    minHeight: 160,
    marginBottom: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colores.borde,
    fontSize: 16,
    textAlignVertical: 'top',
    color: colores.texto,
    backgroundColor: colores.superficie,
  },
  ok: { marginBottom: 16, fontSize: 16, color: colores.exito },
});
