import Ionicons from '@expo/vector-icons/Ionicons';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { TecladoPin } from '@/components/TecladoPin';
import { obtenerNegocio } from '@/db/negocio';
import { cambiarPin, listarPerfiles, type Perfil, verificarPin } from '@/db/perfiles';
import { esPinValido, LARGO_PIN } from '@/lib/pin';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

/** Elegir quién usa la app e ingresar su PIN. */
export default function PinScreen() {
  const db = useSQLiteContext();
  const { negocioId, entrar, versionDatos } = useSesion();
  const [negocio, setNegocio] = useState('');
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [elegido, setElegido] = useState<Perfil | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recuperando, setRecuperando] = useState(false);

  useEffect(() => {
    if (!negocioId) return;
    obtenerNegocio(db, negocioId).then((n) => setNegocio(n?.nombre ?? ''));
    listarPerfiles(db, negocioId, { soloActivos: true }).then(setPerfiles);
  }, [db, negocioId, versionDatos]);

  const comprobar = useCallback(
    async (perfil: Perfil, valor: string) => {
      if (await verificarPin(db, perfil.id, valor)) {
        entrar(perfil);
      } else {
        setError('PIN incorrecto');
        setPin('');
      }
    },
    [db, entrar],
  );

  const cambiarValor = (valor: string) => {
    setError(null);
    setPin(valor);
    if (elegido && valor.length === LARGO_PIN) comprobar(elegido, valor);
  };

  if (elegido && recuperando) {
    return (
      <RecuperarPin
        perfil={elegido}
        onListo={() => {
          setRecuperando(false);
          setPin('');
          sincronizarAhora(db);
        }}
        onCancelar={() => setRecuperando(false)}
      />
    );
  }

  return (
    <SafeAreaView style={estilos.pantalla}>
      {!elegido ? (
        <ScrollView contentContainerStyle={estilos.contenido}>
          <Text style={estilos.negocio}>{negocio}</Text>
          <Text style={estilos.titulo}>¿Quién eres?</Text>
          {perfiles.map((perfil) => (
            <Pressable
              key={perfil.id}
              accessibilityRole="button"
              onPress={() => setElegido(perfil)}
              style={({ pressed }) => [estilos.perfil, pressed && estilos.perfilPresionado]}
            >
              <Ionicons
                name={perfil.rol === 'dueno' ? 'person-circle' : 'person-circle-outline'}
                size={40}
                color={colores.primario}
              />
              <View>
                <Text style={estilos.nombre}>{perfil.nombre}</Text>
                <Text style={estilos.rol}>{perfil.rol === 'dueno' ? 'Dueño' : 'Cajero'}</Text>
              </View>
            </Pressable>
          ))}
          {perfiles.length === 0 ? (
            <Text style={estilos.vacio}>Cargando usuarios del negocio...</Text>
          ) : null}
        </ScrollView>
      ) : (
        <View style={estilos.contenido}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setElegido(null);
              setPin('');
              setError(null);
            }}
            style={estilos.volver}
          >
            <Ionicons name="chevron-back" size={20} color={colores.primario} />
            <Text style={estilos.textoVolver}>Cambiar usuario</Text>
          </Pressable>
          <Text style={estilos.titulo}>Hola, {elegido.nombre}</Text>
          <Text style={estilos.indicacion}>Ingresa tu PIN</Text>
          <TecladoPin valor={pin} onCambio={cambiarValor} />
          <Text style={estilos.error}>{error ?? ' '}</Text>
          {elegido.rol === 'dueno' ? (
            <Pressable accessibilityRole="button" onPress={() => setRecuperando(true)}>
              <Text style={estilos.enlace}>Olvidé mi PIN</Text>
            </Pressable>
          ) : (
            <Text style={estilos.ayuda}>Si olvidaste tu PIN, pídele al dueño que lo cambie.</Text>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

/** El dueño define un PIN nuevo confirmando la contraseña de la cuenta. */
function RecuperarPin({
  perfil,
  onListo,
  onCancelar,
}: {
  perfil: Perfil;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const db = useSQLiteContext();
  const [contrasena, setContrasena] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const guardar = async () => {
    if (!esPinValido(pin)) {
      setError(`El PIN debe tener ${LARGO_PIN} números.`);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const correo = data.session?.user.email;
      if (!correo) throw new Error('La sesión expiró. Cierra sesión y vuelve a ingresar.');
      const { error: errorAuth } = await supabase.auth.signInWithPassword({
        email: correo,
        password: contrasena,
      });
      if (errorAuth) throw errorAuth;
      await cambiarPin(db, perfil.id, pin);
      onListo();
    } catch (e) {
      setError(mensajeDeError(e));
      setCargando(false);
    }
  };

  return (
    <SafeAreaView style={estilos.pantalla}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Nuevo PIN</Text>
        <Text style={estilos.indicacion}>
          Confirma la contraseña de la cuenta del negocio (necesita internet).
        </Text>
        {error ? <Text style={estilos.error}>{error}</Text> : null}
        <Campo
          etiqueta="Contraseña de la cuenta"
          secureTextEntry
          value={contrasena}
          onChangeText={setContrasena}
        />
        <Campo
          etiqueta={`PIN nuevo (${LARGO_PIN} números)`}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={LARGO_PIN}
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, ''))}
        />
        <View style={estilos.acciones}>
          <Boton titulo="Guardar PIN" onPress={guardar} cargando={cargando} />
          <Boton titulo="Cancelar" variante="secundario" onPress={onCancelar} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 24 },
  negocio: { fontSize: 15, color: colores.textoSecundario, textAlign: 'center' },
  titulo: {
    marginTop: 8,
    marginBottom: 16,
    fontSize: 26,
    fontWeight: '700',
    color: colores.texto,
    textAlign: 'center',
  },
  perfil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  perfilPresionado: { opacity: 0.6 },
  nombre: { fontSize: 18, fontWeight: '600', color: colores.texto },
  rol: { fontSize: 14, color: colores.textoSecundario },
  vacio: { textAlign: 'center', color: colores.textoSecundario },
  volver: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  textoVolver: { fontSize: 16, color: colores.primario },
  indicacion: { textAlign: 'center', fontSize: 16, color: colores.textoSecundario },
  error: { marginVertical: 8, textAlign: 'center', fontSize: 15, color: colores.error },
  enlace: { textAlign: 'center', fontSize: 15, color: colores.primario },
  ayuda: { textAlign: 'center', fontSize: 14, color: colores.textoSecundario },
  acciones: { gap: 12 },
});
