import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, usePathname } from 'expo-router';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCarrito } from '@/features/ventas/carrito';
import { useSesion } from '@/sesion/store';
import { colores, radios } from '@/theme/colores';
import { pedirPersistencia } from '@/web/plataforma/persistencia';
import { registrarServiceWorker, useVersionWeb } from '@/web/plataforma/serviceWorker';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];
type Opcion = {
  texto: string;
  icono: NombreIcono;
  ruta: Href;
  activaEn: string[];
  soloDueno?: boolean;
};

const OPCIONES: Opcion[] = [
  { texto: 'Vender', icono: 'cart-outline', ruta: '/vender', activaEn: ['/vender', '/cobrar'] },
  { texto: 'Caja', icono: 'cash-outline', ruta: '/caja', activaEn: ['/caja'] },
  { texto: 'Ventas', icono: 'receipt-outline', ruta: '/ventas', activaEn: ['/ventas', '/venta'] },
  { texto: 'Inicio', icono: 'home-outline', ruta: '/', activaEn: ['/'] },
  {
    texto: 'Productos',
    icono: 'cube-outline',
    ruta: '/inventario',
    activaEn: ['/inventario', '/producto', '/categorias', '/importar'],
  },
  {
    texto: 'Llegó mercadería',
    icono: 'download-outline',
    ruta: '/compra',
    activaEn: ['/compra', '/compras', '/proveedores'],
    soloDueno: true,
  },
  {
    texto: 'Contar stock',
    icono: 'clipboard-outline',
    ruta: '/conteo',
    activaEn: ['/conteo'],
    soloDueno: true,
  },
  {
    texto: 'Por reponer',
    icono: 'alert-circle-outline',
    ruta: '/reponer',
    activaEn: ['/reponer'],
    soloDueno: true,
  },
  {
    texto: 'Clientes y fiado',
    icono: 'people-outline',
    ruta: '/clientes',
    activaEn: ['/clientes', '/cliente'],
  },
  {
    texto: 'Reportes',
    icono: 'bar-chart-outline',
    ruta: '/estadisticas',
    activaEn: ['/estadisticas', '/reportes'],
    soloDueno: true,
  },
  {
    texto: 'Más',
    icono: 'menu-outline',
    ruta: '/mas',
    activaEn: ['/mas', '/suscripcion', '/negocio', '/usuarios', '/exportar', '/admin'],
  },
];

function activa(opcion: Opcion, ruta: string) {
  return opcion.activaEn.some((r) => (r === '/' ? ruta === '/' : ruta.startsWith(r)));
}

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
  const ruta = usePathname();
  const perfil = useSesion((s) => s.perfil);
  const salir = useSesion((s) => s.salir);
  const sync = useSesion((s) => s.sync);
  const enLinea = useEnLinea();
  const esDueno = perfil?.rol === 'dueno';

  const estadoSync = !enLinea
    ? { texto: 'Sin internet: se guarda en este PC', color: colores.aviso }
    : sync.estado === 'error'
      ? { texto: 'Error al sincronizar', color: colores.error }
      : sync.pendientes > 0
        ? { texto: `${sync.pendientes} cambio(s) por subir`, color: colores.aviso }
        : { texto: 'Todo sincronizado', color: colores.exito };

  return (
    <View style={estilos.menu}>
      <Text style={estilos.marca}>Stockeao</Text>
      <View style={estilos.opciones}>
        {OPCIONES.filter((o) => !o.soloDueno || esDueno).map((o) => {
          const seleccionada = activa(o, ruta);
          return (
            <Pressable
              key={o.texto}
              accessibilityRole="link"
              accessibilityState={{ selected: seleccionada }}
              onPress={() => router.navigate(o.ruta)}
              style={[estilos.opcion, seleccionada && estilos.opcionActiva]}
            >
              <Ionicons
                name={o.icono}
                size={22}
                color={seleccionada ? colores.superficie : colores.primarioSuave}
              />
              <Text style={[estilos.textoOpcion, seleccionada && estilos.textoOpcionActiva]}>
                {o.texto}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={estilos.pie}>
        <View style={estilos.estado}>
          <View style={[estilos.punto, { backgroundColor: estadoSync.color }]} />
          <Text style={estilos.textoEstado}>{estadoSync.texto}</Text>
        </View>
        <Text style={estilos.usuario}>{perfil?.nombre}</Text>
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
    width: 240,
    paddingVertical: 20,
    paddingHorizontal: 12,
    backgroundColor: colores.primario,
  },
  marca: {
    paddingHorizontal: 12,
    marginBottom: 20,
    fontSize: 24,
    fontWeight: '800',
    color: colores.superficie,
  },
  opciones: { flex: 1, gap: 4 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radios.chico,
  },
  opcionActiva: { backgroundColor: 'rgba(255,255,255,0.16)' },
  textoOpcion: { fontSize: 17, color: colores.primarioSuave },
  textoOpcionActiva: { color: colores.superficie, fontWeight: '700' },
  pie: {
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  estado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  punto: { width: 10, height: 10, borderRadius: 5 },
  textoEstado: { flex: 1, fontSize: 13, color: colores.primarioSuave },
  usuario: { fontSize: 16, fontWeight: '700', color: colores.superficie },
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
