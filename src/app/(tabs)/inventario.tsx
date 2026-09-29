import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Escaner } from '@/components/Escaner';
import { Selector } from '@/components/Selector';
import { type Categoria, listarCategorias } from '@/db/categorias';
import { buscarPorCodigo, listarProductos, type Producto } from '@/db/productos';
import { formatearCLP } from '@/lib/formato';
import { formatearCantidad } from '@/lib/numeros';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

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
        <View style={estilos.acciones}>
          <Accion icono="add" texto="Nuevo" onPress={() => router.push('/producto/nuevo')} />
          <Accion
            icono="pricetags-outline"
            texto="Categorías"
            onPress={() => router.push('/categorias')}
          />
          <Accion
            icono="document-text-outline"
            texto="Importar"
            onPress={() => router.push('/importar')}
          />
        </View>
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

      <Escaner visible={escaneando} onCodigo={alEscanear} onCerrar={() => setEscaneando(false)} />
    </View>
  );
}

function FilaProducto({ producto }: { producto: Producto }) {
  const sinStock = producto.stock <= 0;
  const stockBajo = !sinStock && producto.stockMinimo > 0 && producto.stock <= producto.stockMinimo;
  const colorStock = sinStock ? colores.error : stockBajo ? colores.aviso : colores.textoSecundario;
  const unidad = producto.unidad === 'kg' ? ' kg' : '';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/producto/${producto.id}`)}
      style={({ pressed }) => [estilos.fila, pressed && estilos.presionada]}
    >
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
        <Text style={[estilos.stock, { color: colorStock }]}>
          {sinStock ? 'Sin stock' : `Stock: ${formatearCantidad(producto.stock)}${unidad}`}
        </Text>
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
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  entrada: { flex: 1, minHeight: 46, fontSize: 16, color: colores.texto },
  botonIcono: {
    width: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primario,
  },
  categorias: { paddingHorizontal: 12 },
  acciones: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 6 },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  textoAccion: { fontSize: 15, color: colores.primario },
  lista: { padding: 12, paddingTop: 4, flexGrow: 1 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  presionada: { opacity: 0.6 },
  datos: { flex: 1, paddingRight: 8 },
  nombre: { fontSize: 16, fontWeight: '600', color: colores.texto },
  inactivo: { color: colores.inactivo },
  detalle: { marginTop: 2, fontSize: 13, color: colores.textoSecundario },
  derecha: { alignItems: 'flex-end' },
  precio: { fontSize: 17, fontWeight: '700', color: colores.texto },
  stock: { marginTop: 2, fontSize: 13 },
  vacio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  textoVacio: { fontSize: 16, color: colores.textoSecundario },
  botonesVacio: { alignSelf: 'stretch', gap: 10, marginTop: 8 },
});
