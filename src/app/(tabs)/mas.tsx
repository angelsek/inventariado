import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenerNegocio } from '@/db/negocio';
import { formatearFechaHora } from '@/lib/formato';
import { useActualizacion } from '@/features/actualizacion/actualizacion';
import { supabase } from '@/lib/supabase';
import { versionActual } from '@/lib/version';
import { cerrarSesion } from '@/sesion/cuenta';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

export default function MasScreen() {
  const db = useSQLiteContext();
  const { negocioId, perfil, sync, salir, versionDatos } = useSesion();
  const [negocio, setNegocio] = useState('');
  const esDueno = perfil?.rol === 'dueno';

  const [esAdmin, setEsAdmin] = useState(false);
  const nueva = useActualizacion((s) => s.nueva);

  useEffect(() => {
    if (negocioId) obtenerNegocio(db, negocioId).then((n) => setNegocio(n?.nombre ?? ''));
  }, [db, negocioId, versionDatos]);

  // Solo las cuentas administradoras de la app ven el panel (requiere internet).
  useFocusEffect(
    useCallback(() => {
      if (!esDueno) return;
      supabase
        .rpc('es_admin')
        .then(({ data }) => setEsAdmin(data === true))
        .then(undefined, () => {});
    }, [esDueno]),
  );

  const confirmarCierre = () => {
    const advertencia =
      sync.pendientes > 0 ? `Hay ${sync.pendientes} cambio(s) sin subir que se perderán. ` : '';
    Alert.alert(
      'Cerrar sesión',
      `${advertencia}Este teléfono se desconectará del negocio y habrá que volver a ingresar con correo y contraseña.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: () => cerrarSesion(db) },
      ],
    );
  };

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View style={estilos.tarjeta}>
        <Text style={estilos.negocio}>{negocio}</Text>
        <Text style={estilos.usuario}>
          {perfil?.nombre} · {esDueno ? 'Dueño' : 'Cajero'}
        </Text>
      </View>

      <Text style={estilos.seccion}>Sincronización</Text>
      <View style={estilos.tarjeta}>
        <EstadoSync />
        <Opcion
          icono="sync-outline"
          texto="Sincronizar ahora"
          onPress={() => sincronizarAhora(db)}
        />
      </View>

      <Text style={estilos.seccion}>Cuenta</Text>
      <View style={estilos.tarjeta}>
        <Opcion icono="people-outline" texto="Cambiar de usuario" onPress={salir} />
        {esDueno ? (
          <Opcion
            icono="person-add-outline"
            texto="Usuarios y cajeros"
            onPress={() => router.push('/usuarios')}
          />
        ) : null}
        {esDueno ? (
          <Opcion icono="log-out-outline" texto="Cerrar sesión" peligro onPress={confirmarCierre} />
        ) : null}
      </View>

      <Text style={estilos.seccion}>Servicio</Text>
      <View style={estilos.tarjeta}>
        <Opcion
          icono="card-outline"
          texto="Suscripción"
          onPress={() => router.push('/suscripcion')}
        />
        {esDueno ? (
          <Opcion
            icono="download-outline"
            texto="Exportar datos"
            onPress={() => router.push('/exportar')}
          />
        ) : null}
        <Opcion
          icono="chatbubble-ellipses-outline"
          texto="Enviar comentario o problema"
          onPress={() => router.push('/comentario')}
        />
        {esAdmin ? (
          <Opcion
            icono="shield-checkmark-outline"
            texto="Administración"
            onPress={() => router.push('/admin')}
          />
        ) : null}
        <Opcion
          icono="document-text-outline"
          texto="Términos y condiciones"
          onPress={() => router.push('/legal/terminos')}
        />
        <Opcion
          icono="lock-closed-outline"
          texto="Política de privacidad"
          onPress={() => router.push('/legal/privacidad')}
        />
      </View>

      <Text style={estilos.version}>Versión {versionActual().texto}</Text>
      {nueva ? (
        <Text
          accessibilityRole="button"
          style={estilos.nuevaVersion}
          onPress={() => Linking.openURL(nueva.url)}
        >
          Descargar versión {nueva.version} ({nueva.version_code})
        </Text>
      ) : null}
    </ScrollView>
  );
}

function EstadoSync() {
  const sync = useSesion((s) => s.sync);
  const [texto, color] =
    sync.estado === 'sincronizando'
      ? ['Sincronizando...', colores.textoSecundario]
      : sync.estado === 'error'
        ? [sync.error ?? 'Sin conexión', colores.aviso]
        : sync.estado === 'ok'
          ? ['Todo sincronizado', colores.exito]
          : ['Esperando conexión', colores.textoSecundario];

  return (
    <View style={estilos.estado}>
      <Text style={[estilos.estadoTexto, { color }]}>{texto}</Text>
      {sync.ultima ? (
        <Text style={estilos.detalle}>Última vez: {formatearFechaHora(new Date(sync.ultima))}</Text>
      ) : null}
      {sync.pendientes > 0 ? (
        <Text style={estilos.detalle}>{sync.pendientes} cambio(s) por subir</Text>
      ) : null}
    </View>
  );
}

function Opcion({
  icono,
  texto,
  onPress,
  peligro,
}: {
  icono: React.ComponentProps<typeof Ionicons>['name'];
  texto: string;
  onPress: () => void;
  peligro?: boolean;
}) {
  const color = peligro ? colores.error : colores.texto;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [estilos.opcion, pressed && estilos.presionada]}
    >
      <Ionicons name={icono} size={22} color={color} />
      <Text style={[estilos.opcionTexto, { color }]}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16 },
  tarjeta: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
    overflow: 'hidden',
  },
  negocio: { paddingHorizontal: 16, paddingTop: 16, fontSize: 18, fontWeight: '600' },
  usuario: { paddingHorizontal: 16, paddingBottom: 16, color: colores.textoSecundario },
  seccion: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
  estado: { padding: 16, borderBottomWidth: 1, borderBottomColor: colores.borde },
  estadoTexto: { fontSize: 15, fontWeight: '600' },
  detalle: { marginTop: 4, fontSize: 13, color: colores.textoSecundario },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colores.borde,
  },
  presionada: { backgroundColor: colores.fondo },
  opcionTexto: { fontSize: 16 },
  version: { marginTop: 24, textAlign: 'center', color: colores.inactivo },
  nuevaVersion: { marginTop: 8, textAlign: 'center', fontSize: 15, color: colores.primario },
});
