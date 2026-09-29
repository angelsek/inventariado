import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { mensajeDeError } from '@/lib/supabase';
import { esCorreoValido } from '@/lib/validacion';
import { iniciarSesion } from '@/sesion/cuenta';
import { colores } from '@/theme/colores';

export default function IngresarScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ aviso?: string; correo?: string }>();
  const [correo, setCorreo] = useState(params.correo ?? '');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async () => {
    if (!esCorreoValido(correo) || !contrasena) {
      setError('Ingresa tu correo y contraseña.');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const resultado = await iniciarSesion(db, correo, contrasena);
      if (resultado.tipo === 'sin_negocio') router.replace('/crear-negocio');
    } catch (e) {
      setError(mensajeDeError(e));
      setCargando(false);
    }
  };

  return (
    <Formulario
      titulo="Inicia sesión"
      subtitulo="Usa la cuenta del negocio. Cada teléfono del local se conecta con la misma cuenta."
      error={error}
    >
      {params.aviso === 'confirmar' ? (
        <Text style={estilos.aviso}>
          Te enviamos un correo para confirmar tu cuenta. Confírmala y luego inicia sesión aquí.
        </Text>
      ) : null}
      {params.aviso === 'existente' ? (
        <Text style={estilos.aviso}>
          Ese correo ya tiene una cuenta. Inicia sesión con la contraseña que ya usabas y luego
          completarás los datos del negocio.
        </Text>
      ) : null}
      <Campo
        etiqueta="Correo"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={correo}
        onChangeText={setCorreo}
      />
      <Campo
        etiqueta="Contraseña"
        secureTextEntry
        autoComplete="current-password"
        value={contrasena}
        onChangeText={setContrasena}
      />
      <Boton titulo="Ingresar" onPress={enviar} cargando={cargando} />
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  aviso: { marginBottom: 16, fontSize: 15, color: colores.exito },
});
