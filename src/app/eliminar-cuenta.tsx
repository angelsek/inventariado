import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { mensajeDeError } from '@/lib/supabase';
import { eliminarNegocio } from '@/sesion/cuenta';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

const CONFIRMACION = 'ELIMINAR';

/** Eliminar el negocio y todos sus datos (exigido por Google Play). Solo el dueño. */
export default function EliminarCuentaScreen() {
  const db = useSQLiteContext();
  const perfil = useSesion((s) => s.perfil);
  const [confirmacion, setConfirmacion] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  if (perfil?.rol !== 'dueno') {
    return (
      <Formulario titulo="Eliminar cuenta" error="Solo el dueño puede eliminar el negocio.">
        <View />
      </Formulario>
    );
  }

  const listo = confirmacion.trim().toUpperCase() === CONFIRMACION && contrasena.length > 0;

  const eliminar = async () => {
    setEliminando(true);
    setError(null);
    try {
      await eliminarNegocio(db, contrasena);
      // La navegación vuelve sola a la bienvenida al cerrarse la sesión.
    } catch (e) {
      setError(mensajeDeError(e));
      setEliminando(false);
    }
  };

  return (
    <Formulario titulo="Eliminar cuenta y datos" error={error}>
      <View style={estilos.aviso}>
        <Text style={estilos.textoAviso}>Esto no se puede deshacer. Se eliminan para siempre:</Text>
        <Text style={estilos.item}>• El negocio, sus usuarios y teléfonos</Text>
        <Text style={estilos.item}>• Productos, stock, ventas, cajas, proveedores e ingresos</Text>
        <Text style={estilos.item}>• La suscripción y el historial de pagos</Text>
        <Text style={estilos.textoAviso}>
          Si quieres conservar tu información, antes descárgala en Más → Exportar datos.
        </Text>
      </View>
      <Campo
        etiqueta={`Escribe ${CONFIRMACION} para confirmar`}
        autoCapitalize="characters"
        value={confirmacion}
        onChangeText={setConfirmacion}
      />
      <Campo
        etiqueta="Contraseña de la cuenta"
        secureTextEntry
        value={contrasena}
        onChangeText={setContrasena}
      />
      <Boton
        titulo="Eliminar definitivamente"
        variante="peligro"
        deshabilitado={!listo}
        cargando={eliminando}
        onPress={eliminar}
      />
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  aviso: {
    padding: 16,
    marginBottom: 20,
    gap: 6,
    borderRadius: 12,
    backgroundColor: colores.fondoError,
  },
  textoAviso: { fontSize: 15, color: colores.error },
  item: { fontSize: 14, color: colores.texto },
});
