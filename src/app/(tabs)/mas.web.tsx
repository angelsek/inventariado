import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { type ComponentProps, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenerNegocio } from '@/db/negocio';
import { useBase } from '@/db/proveedor';
import { confirmarCierreSesion } from '@/features/cuenta/cierreSesion';
import { formatearFechaHora } from '@/lib/formato';
import { supabase } from '@/lib/supabase';
import { versionActual } from '@/lib/version';
import { useNombreConEtiqueta, usePermiso } from '@/sesion/permisos';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

/**
 * Web (PC): "Cuenta y equipo". Solo lo que no está en el menú lateral (usuario, sincronización,
 * sesión, ayuda y legales); negocio, usuarios, suscripción, exportar, reportes y clientes se
 * abren desde el menú. La pantalla del teléfono es mas.tsx.
 */
export default function CuentaYEquipo() {
  const db = useBase();
  const { negocioId, perfil, sync, salir, versionDatos } = useSesion();
  const esDueno = perfil?.rol === 'dueno';
  const nombreConEtiqueta = useNombreConEtiqueta();
  const puedeEliminar = usePermiso('cuenta_eliminar');
  const [negocio, setNegocio] = useState('');
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    if (!negocioId) return;
    obtenerNegocio(db, negocioId)
      .then((n) => setNegocio(n?.nombre ?? ''))
      .catch(() => {});
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

  const estadoSync =
    sync.estado === 'sincronizando'
      ? 'Sincronizando…'
      : sync.estado === 'error'
        ? (sync.error ?? 'Sin conexión')
        : sync.pendientes > 0
          ? `${sync.pendientes} cambio(s) por subir`
          : 'Todo sincronizado';

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Seccion titulo="Usuario y equipo">
        <Fila etiqueta="Negocio" valor={negocio} />
        <Fila etiqueta="Usuario" valor={nombreConEtiqueta} />
        <Fila
          etiqueta="Sincronización"
          valor={estadoSync}
          detalle={sync.ultima ? `Última: ${formatearFechaHora(new Date(sync.ultima))}` : undefined}
        />
        <View style={estilos.acciones}>
          <BotonAccion
            icono="refresh"
            texto="Sincronizar ahora"
            onPress={() => sincronizarAhora(db)}
          />
          <BotonAccion icono="people-outline" texto="Cambiar de usuario" onPress={salir} />
          {esDueno ? (
            <BotonAccion
              icono="log-out-outline"
              texto="Cerrar sesión en este PC"
              onPress={() => confirmarCierreSesion(db, sync.pendientes)}
            />
          ) : null}
        </View>
      </Seccion>

      <Seccion titulo="Ayuda e información">
        <Enlace
          icono="chatbubble-ellipses-outline"
          texto="Enviar comentario o problema"
          ruta="/comentario"
        />
        {esAdmin ? <Enlace icono="shield-outline" texto="Administración" ruta="/admin" /> : null}
        <Enlace
          icono="document-text-outline"
          texto="Términos y condiciones"
          ruta="/legal/terminos"
        />
        <Enlace
          icono="lock-closed-outline"
          texto="Política de privacidad"
          ruta="/legal/privacidad"
        />
        <Text style={estilos.version}>Stockeao {versionActual().texto}</Text>
      </Seccion>

      {puedeEliminar ? (
        <Seccion titulo="Zona de peligro" peligro>
          <Text style={estilos.nota}>
            Elimina el negocio y todos sus datos de todos los equipos. No se puede deshacer.
          </Text>
          <View style={estilos.acciones}>
            <BotonAccion
              icono="trash-outline"
              texto="Eliminar cuenta y datos"
              peligro
              onPress={() => router.push('/eliminar-cuenta')}
            />
          </View>
        </Seccion>
      ) : null}
    </ScrollView>
  );
}

function Seccion({
  titulo,
  peligro,
  children,
}: {
  titulo: string;
  peligro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[estilos.seccion, peligro && estilos.seccionPeligro]}>
      <Text style={[estilos.tituloSeccion, peligro && { color: colores.error }]}>{titulo}</Text>
      {children}
    </View>
  );
}

function Fila({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <View style={{ flex: 1 }}>
        <Text style={estilos.valor}>{valor}</Text>
        {detalle ? <Text style={estilos.nota}>{detalle}</Text> : null}
      </View>
    </View>
  );
}

function BotonAccion({
  icono,
  texto,
  peligro,
  onPress,
}: {
  icono: NombreIcono;
  texto: string;
  peligro?: boolean;
  onPress: () => void;
}) {
  const color = peligro ? colores.error : colores.primario;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[estilos.boton, { borderColor: peligro ? colores.error : colores.borde }]}
    >
      <Ionicons name={icono} size={17} color={color} />
      <Text style={[estilos.textoBoton, { color }]}>{texto}</Text>
    </Pressable>
  );
}

function Enlace({ icono, texto, ruta }: { icono: NombreIcono; texto: string; ruta: Href }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(ruta)} style={estilos.enlace}>
      <Ionicons name={icono} size={18} color={colores.textoSecundario} />
      <Text style={estilos.textoEnlace}>{texto}</Text>
      <Ionicons name="chevron-forward" size={16} color={colores.inactivo} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 24, gap: 16 },
  seccion: {
    padding: 20,
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  seccionPeligro: { borderColor: colores.fondoError },
  tituloSeccion: { marginBottom: 8, fontSize: 17, fontWeight: '700', color: colores.texto },
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  etiqueta: { width: 160, fontSize: 15, color: colores.textoSecundario },
  valor: { fontSize: 15, fontWeight: '600', color: colores.texto },
  nota: { marginTop: 2, fontSize: 13, color: colores.textoSecundario },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: colores.superficie,
  },
  textoBoton: { fontSize: 15, fontWeight: '600' },
  enlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  textoEnlace: { flex: 1, fontSize: 15, color: colores.texto },
  version: { marginTop: 12, fontSize: 13, color: colores.inactivo },
});
