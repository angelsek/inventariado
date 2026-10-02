import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { cambiarActivo, cambiarPin, crearPerfil, listarPerfiles, type Perfil } from '@/db/perfiles';
import { esPinValido, LARGO_PIN } from '@/lib/pin';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

/** Administración de cajeros (solo dueño). */
export default function UsuariosScreen() {
  const db = useSQLiteContext();
  const { negocioId, perfil: actual, versionDatos, datosCambiaron } = useSesion();
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [editandoPin, setEditandoPin] = useState<string | null>(null);
  const [pinNuevo, setPinNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(() => {
    if (negocioId) listarPerfiles(db, negocioId).then(setPerfiles);
  }, [db, negocioId]);

  useEffect(recargar, [recargar, versionDatos]);

  const despuesDeCambiar = () => {
    datosCambiaron();
    sincronizarAhora(db);
  };

  if (actual?.rol !== 'dueno') {
    return (
      <Formulario titulo="Usuarios" error="Solo el dueño puede administrar usuarios.">
        <View />
      </Formulario>
    );
  }

  const agregar = async () => {
    if (!nombre.trim()) return setError('Ingresa el nombre del cajero.');
    if (!esPinValido(pin)) return setError(`El PIN debe tener ${LARGO_PIN} números.`);
    setError(null);
    await crearPerfil(db, { negocioId: negocioId!, nombre, rol: 'cajero', pin });
    setNombre('');
    setPin('');
    despuesDeCambiar();
  };

  const guardarPin = async (perfilId: string) => {
    if (!esPinValido(pinNuevo)) return setError(`El PIN debe tener ${LARGO_PIN} números.`);
    setError(null);
    await cambiarPin(db, perfilId, pinNuevo);
    setEditandoPin(null);
    setPinNuevo('');
    despuesDeCambiar();
  };

  const soloNumeros = (v: string) => v.replace(/\D/g, '').slice(0, LARGO_PIN);

  return (
    <Formulario
      titulo="Usuarios"
      subtitulo="Cada persona entra con su PIN. Los cambios llegan a todos los teléfonos del local."
      error={error}
    >
      {perfiles.map((p) => (
        <View key={p.id} style={estilos.tarjeta}>
          <View style={estilos.fila}>
            <View style={estilos.datos}>
              <Text style={estilos.nombre}>{p.nombre}</Text>
              <Text style={estilos.rol}>
                {p.rol === 'dueno' ? 'Dueño' : 'Cajero'}
                {p.activo ? '' : ' · desactivado'}
              </Text>
            </View>
            {p.rol === 'cajero' ? (
              <Switch
                accessibilityLabel={`Activo: ${p.nombre}`}
                value={p.activo}
                onValueChange={async (activo) => {
                  await cambiarActivo(db, p.id, activo);
                  despuesDeCambiar();
                }}
              />
            ) : null}
          </View>
          {editandoPin === p.id ? (
            <View style={estilos.editar}>
              <Campo
                etiqueta="PIN nuevo"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={LARGO_PIN}
                value={pinNuevo}
                onChangeText={(v) => setPinNuevo(soloNumeros(v))}
              />
              <Boton titulo="Guardar PIN" onPress={() => guardarPin(p.id)} />
            </View>
          ) : (
            <Text
              accessibilityRole="button"
              style={estilos.enlace}
              onPress={() => {
                setEditandoPin(p.id);
                setPinNuevo('');
              }}
            >
              Cambiar PIN
            </Text>
          )}
        </View>
      ))}

      <Text style={estilos.seccion}>Nuevo cajero</Text>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} />
      <Campo
        etiqueta={`PIN (${LARGO_PIN} números)`}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={LARGO_PIN}
        value={pin}
        onChangeText={(v) => setPin(soloNumeros(v))}
      />
      <Boton titulo="Agregar cajero" onPress={agregar} />
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    padding: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  fila: { flexDirection: 'row', alignItems: 'center' },
  datos: { flex: 1 },
  nombre: { fontSize: 17, fontWeight: '600', color: colores.texto },
  rol: { fontSize: 14, color: colores.textoSecundario },
  enlace: { marginTop: 8, fontSize: 15, color: colores.primario },
  editar: { marginTop: 12 },
  seccion: {
    marginTop: 16,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
});
