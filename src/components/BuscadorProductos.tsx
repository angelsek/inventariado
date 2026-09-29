import Ionicons from '@expo/vector-icons/Ionicons';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { buscarPorCodigo, listarProductos, type Producto } from '@/db/productos';
import { formatearCantidad } from '@/lib/numeros';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

import { Escaner } from './Escaner';

type Props = {
  onElegir: (producto: Producto) => void;
  /** Si el escáner queda abierto para leer varios productos seguidos. */
  escanerContinuo?: boolean;
};

/** Buscador por nombre + escáner, para elegir productos del catálogo dentro de una pantalla. */
export function BuscadorProductos({ onElegir, escanerContinuo }: Props) {
  const db = useSQLiteContext();
  const negocioId = useSesion((s) => s.negocioId);
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [escaneando, setEscaneando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    if (!negocioId || !busqueda.trim()) return;
    listarProductos(db, negocioId, { busqueda, incluirInactivos: true }).then((lista) =>
      setResultados(lista.slice(0, 8)),
    );
  }, [db, negocioId, busqueda]);

  const elegir = (producto: Producto) => {
    setBusqueda('');
    onElegir(producto);
  };

  const alEscanear = async (codigo: string) => {
    const producto = await buscarPorCodigo(db, negocioId!, codigo);
    if (!producto) {
      setMensaje(`Código ${codigo} no está en el catálogo`);
      return;
    }
    setMensaje(`✓ ${producto.nombre}`);
    if (!escanerContinuo) setEscaneando(false);
    elegir(producto);
  };

  return (
    <View style={estilos.contenedor}>
      <View style={estilos.barra}>
        <View style={estilos.buscador}>
          <Ionicons name="search" size={20} color={colores.inactivo} />
          <TextInput
            accessibilityLabel="Buscar producto"
            placeholder="Buscar producto"
            placeholderTextColor={colores.inactivo}
            value={busqueda}
            onChangeText={setBusqueda}
            style={estilos.entrada}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escanear producto"
          onPress={() => {
            setMensaje(null);
            setEscaneando(true);
          }}
          style={estilos.botonIcono}
        >
          <Ionicons name="barcode-outline" size={26} color={colores.superficie} />
        </Pressable>
      </View>
      {busqueda.trim() ? (
        <View style={estilos.resultados}>
          {resultados.length === 0 ? (
            <Text style={estilos.vacio}>No hay productos que coincidan.</Text>
          ) : (
            resultados.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => elegir(p)}
                style={({ pressed }) => [estilos.resultado, pressed && estilos.presionado]}
              >
                <Text style={estilos.nombre}>{p.nombre}</Text>
                <Text style={estilos.detalle}>
                  Stock: {formatearCantidad(p.stock)}
                  {p.unidad === 'kg' ? ' kg' : ''}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
      <Escaner
        visible={escaneando}
        continuo={escanerContinuo}
        mensaje={mensaje}
        onCodigo={alEscanear}
        onCerrar={() => setEscaneando(false)}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { marginBottom: 12 },
  barra: { flexDirection: 'row', gap: 8 },
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
    width: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primario,
  },
  resultados: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  resultado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.borde,
  },
  presionado: { backgroundColor: colores.fondo },
  nombre: { flex: 1, fontSize: 15, color: colores.texto },
  detalle: { fontSize: 13, color: colores.textoSecundario },
  vacio: { padding: 12, color: colores.textoSecundario },
});
