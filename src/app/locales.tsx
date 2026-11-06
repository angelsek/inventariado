import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { useBase } from '@/db/proveedor';
import { textoEstadoLocal } from '@/features/cuenta/locales';
import { avisar } from '@/lib/dialogo';
import { mensajeDeError } from '@/lib/supabase';
import { cambiarDeLocal, leerLocalOrigen, type Local, listarLocales } from '@/sesion/cuenta';
import { useSesion } from '@/sesion/store';
import { colores, radios } from '@/theme/colores';

/**
 * Cambiar de local sin cerrar sesión. El dueño ve todos los locales de la cuenta; las demás
 * personas, solo los que el dueño les asignó. Al cambiar se pide el PIN del local nuevo.
 */
export default function LocalesScreen() {
  const db = useBase();
  const { negocioId, perfil } = useSesion();
  const [locales, setLocales] = useState<Local[] | null>(null);
  const [origen, setOrigen] = useState<{ id: string; nombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState(false);
  const esDueno = perfil?.rol === 'dueno';

  useEffect(() => {
    if (!perfil) return;
    let vigente = true;
    listarLocales(perfil)
      .then((l) => vigente && setLocales(l))
      .catch(() => {
        if (!vigente) return;
        setLocales([]);
        setError('No se pudieron cargar los locales. Revisa tu conexión.');
      });
    leerLocalOrigen(db).then((o) => vigente && setOrigen(o));
    return () => {
      vigente = false;
    };
  }, [db, perfil]);

  const cambiar = (id: string, nombre: string) => {
    avisar(
      'Cambiar de local',
      `Vas a pasar a «${nombre}». Necesitas internet y tu PIN de ese local.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cambiar',
          onPress: async () => {
            setCambiando(true);
            setError(null);
            try {
              await cambiarDeLocal(db, id);
            } catch (e) {
              setError(mensajeDeError(e));
              setCambiando(false);
            }
          },
        },
      ],
    );
  };

  // Quien llegó desde otro local siempre puede volver, aunque ya no figure en la lista.
  const puedeVolver =
    origen && origen.id !== negocioId && !locales?.some((l) => l.id === origen.id);

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.titulo}>Mis locales</Text>
      {error ? (
        <View style={estilos.error} accessibilityRole="alert">
          <Text style={estilos.textoError}>{error}</Text>
        </View>
      ) : null}
      {cambiando ? (
        <View style={estilos.cambiando}>
          <ActivityIndicator color={colores.primario} />
          <Text style={estilos.detalle}>Cambiando de local, esto puede tardar un momento...</Text>
        </View>
      ) : null}

      {locales === null ? <ActivityIndicator color={colores.primario} /> : null}
      {locales?.map((local) => {
        const actual = local.id === negocioId;
        return (
          <Pressable
            key={local.id}
            accessibilityRole="button"
            disabled={actual || cambiando}
            onPress={() => cambiar(local.id, local.nombre)}
            style={({ pressed }) => [estilos.local, pressed && estilos.presionado]}
          >
            <Ionicons
              name={actual ? 'storefront' : 'storefront-outline'}
              size={28}
              color={colores.primario}
            />
            <View style={estilos.textos}>
              <Text style={estilos.nombre}>{local.nombre}</Text>
              <Text style={estilos.detalle}>
                {[local.direccion, textoEstadoLocal(local.estado)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {actual ? <Text style={estilos.actual}>Aquí estás</Text> : null}
          </Pressable>
        );
      })}
      {puedeVolver ? (
        <Pressable
          accessibilityRole="button"
          disabled={cambiando}
          onPress={() => cambiar(origen.id, origen.nombre)}
          style={({ pressed }) => [estilos.local, pressed && estilos.presionado]}
        >
          <Ionicons name="arrow-undo-outline" size={28} color={colores.primario} />
          <View style={estilos.textos}>
            <Text style={estilos.nombre}>Volver a {origen.nombre}</Text>
          </View>
        </Pressable>
      ) : null}

      {locales && locales.length === 0 && !error ? (
        <Text style={estilos.detalle}>No tienes otros locales asignados.</Text>
      ) : null}

      {esDueno ? (
        <View style={estilos.agregar}>
          <Boton
            titulo="Agregar local"
            variante="secundario"
            onPress={() => router.push('/nuevo-local')}
          />
          <Text style={estilos.detalle}>
            Cada local tiene su propia suscripción, sus equipos y sus usuarios.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 40 },
  titulo: { fontSize: 26, fontWeight: '700', color: colores.texto, marginBottom: 16 },
  error: {
    marginBottom: 16,
    padding: 14,
    borderRadius: radios.chico,
    backgroundColor: colores.fondoError,
  },
  textoError: { fontSize: 15, color: colores.error },
  cambiando: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  local: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    padding: 14,
    marginBottom: 10,
    borderRadius: radios.medio,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  presionado: { opacity: 0.6 },
  textos: { flex: 1 },
  nombre: { fontSize: 18, fontWeight: '600', color: colores.texto },
  detalle: { marginTop: 2, fontSize: 14, color: colores.textoSecundario },
  actual: { fontSize: 14, fontWeight: '600', color: colores.exito },
  agregar: { marginTop: 20, gap: 8 },
});
