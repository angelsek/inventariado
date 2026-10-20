import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, usePathname } from 'expo-router';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Logotipo } from '@/components/LogoStockeao';
import { obtenerNegocio } from '@/db/negocio';
import { useBase } from '@/db/proveedor';
import { useCarrito } from '@/features/ventas/carrito';
import { useNombreConEtiqueta, usePermisos } from '@/sesion/permisos';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores, radios } from '@/theme/colores';
import { entradaActiva, menuParaPermisos } from '@/web/navegacion/menu';
import { pedirPersistencia } from '@/web/plataforma/persistencia';
import { registrarServiceWorker, useVersionWeb } from '@/web/plataforma/serviceWorker';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);
  useEffect(() => {
    const cambiar = () => setEnLinea(navigator.onLine);
    window.addEventListener('online', cambiar);
    window.addEventListener('offline', cambiar);
    return () => {
      window.removeEventListener('online', cambiar);
      window.removeEventListener('offline', cambiar);
    };
  }, []);
  return enLinea;
}

registrarServiceWorker();

/**
 * Web (PC): menú lateral fijo a la izquierda (con la sesión iniciada), estado de conexión
 * y sincronización, y aviso de versión nueva de la web.
 */
export function MarcoApp({ children }: { children: ReactNode }) {
  const negocioId = useSesion((s) => s.negocioId);
  const perfil = useSesion((s) => s.perfil);

  // Al vincular el PC se pide que el navegador no borre la base local por falta de espacio.
  useEffect(() => {
    if (negocioId) void pedirPersistencia();
  }, [negocioId]);

  // Sin sesión (bienvenida, ingreso, PIN) las pantallas son las del teléfono: en el PC van en
  // una tarjeta angosta y centrada en vez de ocupar todo el monitor. La estructura de vistas es
  // siempre la misma (solo cambian los estilos), así la navegación no se reinicia al entrar.
  const conSesion = !!negocioId && !!perfil;
  return (
    <View style={[estilos.marco, !conSesion && estilos.marcoAcceso]}>
      {conSesion ? <MenuLateral /> : null}
      <View style={[estilos.contenido, !conSesion && estilos.tarjetaAcceso]}>
        <AvisoVersionNueva />
        {children}
      </View>
    </View>
  );
}

function MenuLateral() {
  const db = useBase();
  const ruta = usePathname();
  const negocioId = useSesion((s) => s.negocioId);
  const versionDatos = useSesion((s) => s.versionDatos);
  const salir = useSesion((s) => s.salir);
  const sync = useSesion((s) => s.sync);
  const enLinea = useEnLinea();
  const permisos = usePermisos();
  const nombreConEtiqueta = useNombreConEtiqueta();
  const activa = entradaActiva(ruta, permisos);
  const [negocio, setNegocio] = useState('');

  useEffect(() => {
    if (!negocioId) return;
    obtenerNegocio(db, negocioId)
      .then((n) => setNegocio(n?.nombre ?? ''))
      .catch(() => {});
  }, [db, negocioId, versionDatos]);

  const estadoSync = !enLinea
    ? { texto: 'Sin internet: se guarda en este PC', color: colores.aviso }
    : sync.estado === 'sincronizando'
      ? { texto: 'Sincronizando…', color: colores.primarioSuave }
      : sync.estado === 'error'
        ? { texto: 'Error al sincronizar', color: colores.error }
        : sync.pendientes > 0
          ? { texto: `${sync.pendientes} cambio(s) por subir`, color: colores.aviso }
          : { texto: 'Todo sincronizado', color: colores.exito };

  return (
    <View style={estilos.menu}>
      <View style={estilos.cabecera}>
        <Logotipo tamano={26} sobreVerde />
        {negocio ? (
          <Text style={estilos.negocio} numberOfLines={1}>
            {negocio}
          </Text>
        ) : null}
      </View>
      <ScrollView style={estilos.opciones} contentContainerStyle={estilos.listaOpciones}>
        {menuParaPermisos(permisos).map((grupo) => (
          <View key={grupo.titulo} style={estilos.grupo}>
            <Text style={estilos.tituloGrupo}>{grupo.titulo.toUpperCase()}</Text>
            {grupo.entradas.map((entrada) => {
              const seleccionada = entrada === activa;
              return (
                <Pressable
                  key={entrada.ruta}
                  accessibilityRole="link"
                  accessibilityState={{ selected: seleccionada }}
                  onPress={() => router.navigate(entrada.ruta as Href)}
                  // react-native-web agrega `hovered` al estado del Pressable (no está en los tipos).
                  style={(estado) => [
                    estilos.opcion,
                    (estado as { hovered?: boolean }).hovered && estilos.opcionEncima,
                    seleccionada && estilos.opcionActiva,
                  ]}
                >
                  <Ionicons
                    name={entrada.icono as NombreIcono}
                    size={19}
                    color={seleccionada ? colores.superficie : colores.primarioSuave}
                  />
                  <Text
                    style={[estilos.textoOpcion, seleccionada && estilos.textoOpcionActiva]}
                    numberOfLines={1}
                  >
                    {entrada.texto}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={estilos.pie}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sincronizar ahora"
          disabled={!enLinea || sync.estado === 'sincronizando'}
          onPress={() => sincronizarAhora(db)}
          style={estilos.estado}
        >
          <View style={[estilos.punto, { backgroundColor: estadoSync.color }]} />
          <Text style={estilos.textoEstado}>{estadoSync.texto}</Text>
          {enLinea ? <Ionicons name="refresh" size={14} color={colores.primarioSuave} /> : null}
        </Pressable>
        <Text style={estilos.usuario} numberOfLines={1}>
          {nombreConEtiqueta}
        </Text>
        <Pressable accessibilityRole="button" onPress={salir}>
          <Text style={estilos.cambiarUsuario}>Cambiar usuario</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AvisoVersionNueva() {
  const hayNueva = useVersionWeb((s) => s.hayNueva);
  const actualizar = useVersionWeb((s) => s.actualizar);
  const ventaEnCurso = useCarrito((s) => s.items.length > 0);
  if (!hayNueva) return null;
  return (
    <View style={estilos.version}>
      <Text style={estilos.textoVersion}>
        {ventaEnCurso
          ? 'Hay una versión nueva de Stockeao. Termina la venta en curso para actualizar.'
          : 'Hay una versión nueva de Stockeao.'}
      </Text>
      {!ventaEnCurso ? (
        <Pressable accessibilityRole="button" onPress={actualizar} style={estilos.botonVersion}>
          <Text style={estilos.textoBotonVersion}>Actualizar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  marco: { flex: 1, flexDirection: 'row', backgroundColor: colores.fondo },
  contenido: { flex: 1 },
  marcoAcceso: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tarjetaAcceso: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    width: '100%',
    maxWidth: 440,
    height: '100%',
    maxHeight: 640,
    borderRadius: radios.grande,
    borderWidth: 1,
    borderColor: colores.borde,
    overflow: 'hidden',
    backgroundColor: colores.superficie,
    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
  },
  menu: {
    width: 248,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: colores.primario,
  },
  cabecera: { paddingHorizontal: 20, marginBottom: 12 },
  negocio: { marginTop: 2, fontSize: 13, color: colores.primarioSuave },
  opciones: { flex: 1 },
  listaOpciones: { paddingHorizontal: 10, paddingBottom: 12, gap: 14 },
  grupo: { gap: 2 },
  tituloGrupo: {
    paddingHorizontal: 10,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(230, 239, 236, 0.6)',
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  opcionEncima: { backgroundColor: 'rgba(255,255,255,0.08)' },
  opcionActiva: { backgroundColor: 'rgba(255,255,255,0.18)' },
  textoOpcion: { flex: 1, fontSize: 15, color: colores.primarioSuave },
  textoOpcionActiva: { color: colores.superficie, fontWeight: '700' },
  pie: {
    gap: 6,
    marginHorizontal: 10,
    paddingHorizontal: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  punto: { width: 10, height: 10, borderRadius: 5 },
  textoEstado: { flex: 1, fontSize: 13, color: colores.primarioSuave },
  usuario: { fontSize: 15, fontWeight: '700', color: colores.superficie },
  cambiarUsuario: { fontSize: 14, color: colores.primarioSuave, textDecorationLine: 'underline' },
  version: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colores.fondoAviso,
  },
  textoVersion: { flex: 1, fontSize: 15, color: colores.aviso, fontWeight: '600' },
  botonVersion: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radios.pastilla,
    backgroundColor: colores.aviso,
  },
  textoBotonVersion: { fontSize: 15, fontWeight: '700', color: colores.superficie },
});
