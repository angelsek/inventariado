import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Boton } from '@/components/Boton';
import { Escaner } from '@/components/Escaner';
import { Selector } from '@/components/Selector';
import { type Categoria, listarCategorias } from '@/db/categorias';
import { buscarPorCodigo, listarProductos, type Producto } from '@/db/productos';
import { formatearCLP } from '@/lib/formato';
import { formatearCantidad } from '@/lib/numeros';
import { useSesion } from '@/sesion/store';
import { colores, radios } from '@/theme/colores';

export default function InventarioScreen() {
  const db = useSQLiteContext();
  const { negocioId, perfil, versionDatos } = useSesion();
  const esDueno = perfil?.rol === 'dueno';
  const [busqueda, setBusqueda] = useState('');
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargado, setCargado] = useState(false);
  const [escaneando, setEscaneando] = useState(false);

  useEffect(() => {
    if (negocioId) listarCategorias(db, negocioId).then(setCategorias);
  }, [db, negocioId, versionDatos]);

  useEffect(() => {
    if (!negocioId) return;
    listarProductos(db, negocioId, { busqueda, categoriaId, incluirInactivos: esDueno }).then(
      (lista) => {
        setProductos(lista);
        setCargado(true);
      },
    );
  }, [db, negocioId, busqueda, categoriaId, esDueno, versionDatos]);

  const alEscanear = async (codigo: string) => {
    setEscaneando(false);
    const producto = await buscarPorCodigo(db, negocioId!, codigo);
    if (producto) {
      router.push(`/producto/${producto.id}`);
    } else if (esDueno) {
      router.push({ pathname: '/producto/[id]', params: { id: 'nuevo', codigo } });
    } else {
      Alert.alert('Producto no encontrado', `No hay ningún producto con el código ${codigo}.`);
    }
  };

  const hayFiltros = busqueda !== '' || categoriaId !== null;

  return (
    <View style={estilos.pantalla}>
      <View style={estilos.barra}>
        <View style={estilos.buscador}>
          <Ionicons name="search" size={20} color={colores.inactivo} />
          <TextInput
            accessibilityLabel="Buscar producto"
            placeholder="Buscar por nombre o código"
            placeholderTextColor={colores.inactivo}
            value={busqueda}
            onChangeText={setBusqueda}
            style={estilos.entrada}
          />
          {busqueda ? (
            <Pressable accessibilityLabel="Borrar búsqueda" onPress={() => setBusqueda('')}>
              <Ionicons name="close-circle" size={20} color={colores.inactivo} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escanear código"
          onPress={() => setEscaneando(true)}
          style={estilos.botonIcono}
        >
          <Ionicons name="barcode-outline" size={26} color={colores.superficie} />
        </Pressable>
      </View>

      {categorias.length > 0 ? (
        <View style={estilos.categorias}>
          <Selector
            horizontal
            opciones={[
              { valor: null as string | null, etiqueta: 'Todas' },
              ...categorias.map((c) => ({ valor: c.id as string | null, etiqueta: c.nombre })),
            ]}
            valor={categoriaId}
            onCambio={setCategoriaId}
          />
        </View>
      ) : null}

      {esDueno ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={estilos.accionesScroll}
          contentContainerStyle={estilos.acciones}
        >
          <Accion icono="download-outline" texto="Ingreso" onPress={() => router.push('/compra')} />
          <Accion
            icono="alert-circle-outline"
            texto="Reponer"
            onPress={() => router.push('/reponer')}
          />
          <Accion icono="clipboard-outline" texto="Conteo" onPress={() => router.push('/conteo')} />
          <Accion
            icono="pricetags-outline"
            texto="Categorías"
            onPress={() => router.push('/categorias')}
          />
          <Accion
            icono="people-outline"
            texto="Proveedores"
            onPress={() => router.push('/proveedores')}
          />
          <Accion
            icono="document-text-outline"
            texto="Importar"
            onPress={() => router.push('/importar')}
          />
        </ScrollView>
      ) : null}

      <FlatList
        data={productos}
        keyExtractor={(p) => p.id}
        contentContainerStyle={estilos.lista}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <FilaProducto producto={item} />}
        ListEmptyComponent={
          cargado ? (
            <View style={estilos.vacio}>
              <Ionicons name="cube-outline" size={56} color={colores.inactivo} />
              <Text style={estilos.textoVacio}>
                {hayFiltros ? 'No hay productos que coincidan.' : 'Aún no hay productos.'}
              </Text>
              {!hayFiltros && esDueno ? (
                <View style={estilos.botonesVacio}>
                  <Boton titulo="Agregar producto" onPress={() => router.push('/producto/nuevo')} />
                  <Boton
                    titulo="Importar desde Excel (CSV)"
                    variante="secundario"
                    onPress={() => router.push('/importar')}
                  />
                </View>
              ) : null}
            </View>
          ) : null
        }
      />

      {esDueno && productos.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nuevo producto"
          onPress={() => router.push('/producto/nuevo')}
          style={({ pressed }) => [estilos.flotante, pressed && estilos.presionada]}
        >
          <Ionicons name="add" size={28} color={colores.superficie} />
          <Text style={estilos.textoFlotante}>Nuevo producto</Text>
        </Pressable>
      ) : null}

      <Escaner visible={escaneando} onCodigo={alEscanear} onCerrar={() => setEscaneando(false)} />
    </View>
  );
}

// Color de fondo del círculo con la inicial, según el nombre (siempre el mismo por producto).
const TONOS = ['#E6EFEC', '#E8F0FB', '#FFF3E0', '#F3E8FA', '#FDECEA', '#EAF6E9'];
const tono = (texto: string) =>
  TONOS[[...texto].reduce((suma, letra) => suma + letra.charCodeAt(0), 0) % TONOS.length];

function FilaProducto({ producto }: { producto: Producto }) {
  const sinStock = producto.stock <= 0;
  const stockBajo = !sinStock && producto.stockMinimo > 0 && producto.stock <= producto.stockMinimo;
  const unidad = producto.unidad === 'kg' ? ' kg' : '';
  const insignia = sinStock
    ? { fondo: colores.fondoError, texto: colores.error }
    : stockBajo
      ? { fondo: colores.fondoAviso, texto: colores.aviso }
      : { fondo: colores.fondoExito, texto: colores.exito };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/producto/${producto.id}`)}
      style={({ pressed }) => [estilos.fila, pressed && estilos.presionada]}
    >
      <View style={[estilos.inicial, { backgroundColor: tono(producto.nombre) }]}>
        <Text style={estilos.textoInicial}>{producto.nombre.trim().charAt(0).toUpperCase()}</Text>
      </View>
      <View style={estilos.datos}>
        <Text style={[estilos.nombre, !producto.activo && estilos.inactivo]} numberOfLines={2}>
          {producto.nombre}
        </Text>
        <Text style={estilos.detalle}>
          {producto.categoria ?? 'Sin categoría'}
          {producto.activo ? '' : ' · desactivado'}
        </Text>
      </View>
      <View style={estilos.derecha}>
        <Text style={estilos.precio}>{formatearCLP(producto.precioVenta)}</Text>
        <View style={[estilos.insignia, { backgroundColor: insignia.fondo }]}>
          <Text style={[estilos.stock, { color: insignia.texto }]}>
            {sinStock ? 'Sin stock' : `Stock: ${formatearCantidad(producto.stock)}${unidad}`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function Accion({
  icono,
  texto,
  onPress,
}: {
  icono: React.ComponentProps<typeof Ionicons>['name'];
  texto: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={estilos.accion}>
      <Ionicons name={icono} size={18} color={colores.primario} />
      <Text style={estilos.textoAccion}>{texto}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  barra: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4 },
  buscador: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: radios.pastilla,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  entrada: { flex: 1, minHeight: 50, fontSize: 17, color: colores.texto },
  botonIcono: {
    width: 52,
    borderRadius: radios.pastilla,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primario,
  },
  categorias: { paddingHorizontal: 12 },
  // Sin encoger: si no, la lista de productos le quita altura y los botones salen cortados.
  accionesScroll: { flexGrow: 0, flexShrink: 0 },
  acciones: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  accion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radios.pastilla,
    backgroundColor: colores.primarioSuave,
  },
  textoAccion: { fontSize: 15, fontWeight: '600', color: colores.primario },
  // Espacio abajo para que el botón flotante no tape el último producto.
  lista: { padding: 12, paddingTop: 4, paddingBottom: 116, flexGrow: 1 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 10,
    borderRadius: radios.medio,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  presionada: { opacity: 0.6 },
  datos: { flex: 1, paddingRight: 8 },
  inicial: {
    width: 48,
    height: 48,
    marginRight: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoInicial: { fontSize: 20, fontWeight: '700', color: colores.primario },
  nombre: { fontSize: 17, fontWeight: '600', color: colores.texto },
  inactivo: { color: colores.inactivo },
  detalle: { marginTop: 2, fontSize: 14, color: colores.textoSecundario },
  derecha: { alignItems: 'flex-end', gap: 4 },
  precio: { fontSize: 18, fontWeight: '700', color: colores.texto },
  insignia: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radios.pastilla },
  stock: { fontSize: 13, fontWeight: '600' },
  flotante: {
    position: 'absolute',
    right: 16,
    // Más arriba que la barra para no topar con el botón Vender, que sobresale.
    bottom: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 18,
    paddingRight: 22,
    minHeight: 60,
    borderRadius: radios.pastilla,
    backgroundColor: colores.primario,
    elevation: 6,
  },
  textoFlotante: { fontSize: 18, fontWeight: '700', color: colores.superficie },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  textoVacio: { fontSize: 16, color: colores.textoSecundario },
  botonesVacio: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
});
