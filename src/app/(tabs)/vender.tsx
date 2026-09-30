import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Escaner } from '@/components/Escaner';
import { Hoja } from '@/components/Hoja';
import { Selector } from '@/components/Selector';
import { obtenerCajaAbierta } from '@/db/cajas';
import { buscarPorCodigo, listarProductos, type Producto } from '@/db/productos';
import {
  calcularTotales,
  descuentoPromo,
  type ItemCarrito,
  totalItem,
} from '@/features/ventas/calculos';
import { useCarrito } from '@/features/ventas/carrito';
import { formatearCLP } from '@/lib/formato';
import { formatearCantidad, parsearCantidad, parsearMonto } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { colores, radios } from '@/theme/colores';

export default function VenderScreen() {
  const db = useSQLiteContext();
  const negocioId = useSesion((s) => s.negocioId);
  const carrito = useCarrito();
  const { total } = calcularTotales(carrito.items, carrito.descuentoGeneral);

  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [escaneando, setEscaneando] = useState(false);
  const [mensajeEscaner, setMensajeEscaner] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pesando, setPesando] = useState<Producto | null>(null);
  const [editando, setEditando] = useState<ItemCarrito | null>(null);
  const [montoLibre, setMontoLibre] = useState(false);
  const [cajaAbierta, setCajaAbierta] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!negocioId) return;
      obtenerAutor(db)
        .then(({ dispositivoId }) => obtenerCajaAbierta(db, negocioId, dispositivoId))
        .then((caja) => setCajaAbierta(!!caja));
    }, [db, negocioId]),
  );

  useEffect(() => {
    if (!negocioId || !busqueda.trim()) return;
    listarProductos(db, negocioId, { busqueda }).then((lista) => setResultados(lista.slice(0, 30)));
  }, [db, negocioId, busqueda]);

  const agregar = (producto: Producto) => {
    setBusqueda('');
    if (producto.unidad === 'kg') {
      setEscaneando(false);
      setPesando(producto);
    } else {
      carrito.agregarProducto(producto);
    }
  };

  const alEscanear = async (codigo: string) => {
    const producto = await buscarPorCodigo(db, negocioId!, codigo);
    if (!producto || !producto.activo) {
      setMensajeEscaner(`Código ${codigo} no está en el catálogo`);
      setAviso(`El código ${codigo} no está en el catálogo.`);
      return;
    }
    setAviso(null);
    // Vuelve a Vender apenas se agrega el producto.
    setEscaneando(false);
    agregar(producto);
  };

  return (
    <View style={estilos.pantalla}>
      <View style={estilos.barra}>
        <View style={estilos.buscador}>
          <Ionicons name="search" size={20} color={colores.inactivo} />
          <TextInput
            accessibilityLabel="Buscar producto para vender"
            placeholder="Buscar producto"
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
          accessibilityLabel="Escanear para vender"
          onPress={() => {
            setMensajeEscaner(null);
            setEscaneando(true);
          }}
          style={estilos.botonIcono}
        >
          <Ionicons name="barcode-outline" size={26} color={colores.superficie} />
        </Pressable>
      </View>

      {!cajaAbierta ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/caja')}
          style={estilos.cajaCerrada}
        >
          <Ionicons name="lock-closed-outline" size={16} color={colores.aviso} />
          <Text style={estilos.textoCaja}>Caja cerrada: toca aquí para abrirla.</Text>
        </Pressable>
      ) : null}

      {aviso ? (
        <Pressable onPress={() => setAviso(null)} style={estilos.aviso}>
          <Text style={estilos.textoAviso}>{aviso}</Text>
        </Pressable>
      ) : null}

      {busqueda.trim() ? (
        <FlatList
          data={resultados}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={estilos.lista}
          ListEmptyComponent={<Text style={estilos.vacio}>No hay productos que coincidan.</Text>}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => agregar(item)}
              style={({ pressed }) => [estilos.resultado, pressed && estilos.presionado]}
            >
              <View style={estilos.flex}>
                <Text style={estilos.nombre}>{item.nombre}</Text>
                <Text style={estilos.detalle}>
                  Stock: {formatearCantidad(item.stock)}
                  {item.unidad === 'kg' ? ' kg' : ''}
                </Text>
              </View>
              <Text style={estilos.precio}>
                {formatearCLP(item.precioVenta)}
                {item.unidad === 'kg' ? '/kg' : ''}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={carrito.items}
          keyExtractor={(i) => i.clave}
          contentContainerStyle={estilos.lista}
          ListEmptyComponent={
            <View style={estilos.vacioCarrito}>
              <Ionicons name="cart-outline" size={56} color={colores.inactivo} />
              <Text style={estilos.vacio}>Escanea o busca productos para empezar una venta.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <LineaCarrito
              item={item}
              onEditar={() => setEditando(item)}
              onCambiar={(cantidad) => carrito.cambiarCantidad(item.clave, cantidad)}
              cobraEnvase={carrito.items.some((i) => i.clave === `envase-${item.clave}`)}
              onEnvase={() => carrito.alternarEnvase(item.clave)}
            />
          )}
        />
      )}

      <View style={estilos.pie}>
        <View style={estilos.accionesPie}>
          <Text
            accessibilityRole="button"
            style={estilos.enlace}
            onPress={() => setMontoLibre(true)}
          >
            + Monto libre
          </Text>
          <Text
            accessibilityRole="button"
            style={estilos.enlace}
            onPress={() => router.push('/ventas')}
          >
            Ventas del día
          </Text>
          {carrito.items.length > 0 ? (
            <Text
              accessibilityRole="button"
              style={[estilos.enlace, estilos.peligro]}
              onPress={carrito.vaciar}
            >
              Vaciar
            </Text>
          ) : null}
        </View>
        <Boton
          titulo={carrito.items.length ? `Cobrar ${formatearCLP(total)}` : 'Cobrar'}
          deshabilitado={carrito.items.length === 0}
          onPress={() => router.push('/cobrar')}
        />
      </View>

      {/* Continuo: si el código no está en el catálogo, sigue abierto para probar otro. */}
      <Escaner
        visible={escaneando}
        continuo
        mensaje={mensajeEscaner}
        onCodigo={alEscanear}
        onCerrar={() => setEscaneando(false)}
      />
      <HojaPeso producto={pesando} onCerrar={() => setPesando(null)} />
      <HojaItem key={editando?.clave} item={editando} onCerrar={() => setEditando(null)} />
      <HojaMontoLibre visible={montoLibre} onCerrar={() => setMontoLibre(false)} />
    </View>
  );
}

function LineaCarrito({
  item,
  onEditar,
  onCambiar,
  cobraEnvase,
  onEnvase,
}: {
  item: ItemCarrito;
  onEditar: () => void;
  onCambiar: (cantidad: number) => void;
  cobraEnvase: boolean;
  onEnvase: () => void;
}) {
  const esKilo = item.unidad === 'kg';
  const sinStock = item.stock !== null && item.stock < item.cantidad;
  const promo = descuentoPromo(item);

  return (
    <Pressable accessibilityRole="button" onPress={onEditar} style={estilos.linea}>
      <View style={estilos.flex}>
        <Text style={estilos.nombre}>{item.nombre}</Text>
        <Text style={estilos.detalle}>
          {formatearCLP(item.precioUnitario)}
          {esKilo ? '/kg' : ' c/u'}
          {item.descuento ? ` · desc. ${formatearCLP(item.descuento)}` : ''}
        </Text>
        {item.promo ? (
          <Text style={[estilos.promo, !promo && estilos.promoInactiva]}>
            Promo {item.promo.cantidad} x {formatearCLP(item.promo.precio)}
            {promo ? ` · ahorro ${formatearCLP(promo)}` : ''}
          </Text>
        ) : null}
        {sinStock ? (
          <Text style={estilos.sinStock}>Stock registrado: {formatearCantidad(item.stock!)}</Text>
        ) : null}
        {item.precioEnvase ? (
          <Text
            accessibilityRole="button"
            accessibilityLabel={`Envase de ${item.nombre}`}
            onPress={onEnvase}
            style={estilos.envase}
          >
            {cobraEnvase
              ? '✓ Cobrando envase (toca si lo trajo)'
              : `¿No trae envase? Cobrar ${formatearCLP(item.precioEnvase)}`}
          </Text>
        ) : null}
      </View>
      <View style={estilos.cantidad}>
        {esKilo ? (
          <Text style={estilos.numero}>{formatearCantidad(item.cantidad)} kg</Text>
        ) : (
          <>
            <Pressable
              accessibilityLabel={`Quitar uno de ${item.nombre}`}
              onPress={() => onCambiar(item.cantidad - 1)}
              style={estilos.botonCantidad}
            >
              <Ionicons name="remove" size={24} color={colores.primario} />
            </Pressable>
            <Text style={estilos.numero}>{formatearCantidad(item.cantidad)}</Text>
            <Pressable
              accessibilityLabel={`Agregar uno de ${item.nombre}`}
              onPress={() => onCambiar(item.cantidad + 1)}
              style={estilos.botonCantidad}
            >
              <Ionicons name="add" size={24} color={colores.primario} />
            </Pressable>
          </>
        )}
      </View>
      <Text style={estilos.totalLinea}>{formatearCLP(totalItem(item))}</Text>
    </Pressable>
  );
}

/** Pide los kilos de un producto que se vende por peso, o el monto a vender ("$1.000 de queso"). */
function HojaPeso({ producto, onCerrar }: { producto: Producto | null; onCerrar: () => void }) {
  const agregarProducto = useCarrito((s) => s.agregarProducto);
  const [porMonto, setPorMonto] = useState(false);
  const [kilos, setKilos] = useState('');
  const [monto, setMonto] = useState('');
  const pesos = parsearMonto(monto || '0') ?? 0;
  // Por monto: los kilos que alcanzan (redondeados al gramo).
  const cantidad = porMonto
    ? producto?.precioVenta
      ? Math.round((pesos / producto.precioVenta) * 1000) / 1000
      : 0
    : (parsearCantidad(kilos || '0') ?? 0);

  const agregar = (valor: number) => {
    if (!producto || valor <= 0) return;
    agregarProducto(producto, valor);
    setKilos('');
    setMonto('');
    onCerrar();
  };

  return (
    <Hoja visible={!!producto} titulo={producto?.nombre ?? ''} onCerrar={onCerrar}>
      <Selector
        opciones={[
          { valor: false, etiqueta: 'Por kilos' },
          { valor: true, etiqueta: 'Por monto ($)' },
        ]}
        valor={porMonto}
        onCambio={setPorMonto}
      />
      <View style={estilos.espacio} />
      {porMonto ? (
        <Campo
          etiqueta="Monto a vender"
          keyboardType="number-pad"
          placeholder="$1.000"
          autoFocus
          value={monto}
          onChangeText={(v) => setMonto(v.replace(/\D/g, ''))}
          ayuda={
            producto && cantidad > 0
              ? `${formatearCantidad(cantidad)} kg · Total: ${formatearCLP(Math.round(cantidad * producto.precioVenta))}`
              : undefined
          }
        />
      ) : (
        <>
          <Campo
            etiqueta="Kilos"
            keyboardType="decimal-pad"
            placeholder="0,5"
            autoFocus
            value={kilos}
            onChangeText={setKilos}
            ayuda={
              producto && cantidad > 0
                ? `Total: ${formatearCLP(Math.round(cantidad * producto.precioVenta))}`
                : undefined
            }
          />
          <View style={estilos.rapidos}>
            {[0.25, 0.5, 1].map((valor) => (
              <View key={valor} style={estilos.flex}>
                <Boton
                  variante="secundario"
                  titulo={`${formatearCantidad(valor)} kg`}
                  onPress={() => agregar(valor)}
                />
              </View>
            ))}
          </View>
        </>
      )}
      <Boton titulo="Agregar" deshabilitado={cantidad <= 0} onPress={() => agregar(cantidad)} />
    </Hoja>
  );
}

/** Cambiar cantidad, aplicar descuento o quitar una línea. */
function HojaItem({ item, onCerrar }: { item: ItemCarrito | null; onCerrar: () => void }) {
  const { cambiarCantidad, cambiarDescuentoItem, quitar } = useCarrito();
  // Se monta de nuevo para cada línea (key), así el estado inicial sale del ítem.
  const [cantidad, setCantidad] = useState(item ? formatearCantidad(item.cantidad) : '');
  const [descuento, setDescuento] = useState(item?.descuento ? String(item.descuento) : '');

  if (!item) return null;

  const guardar = () => {
    const nuevaCantidad = parsearCantidad(cantidad);
    if (nuevaCantidad !== null) cambiarCantidad(item.clave, nuevaCantidad);
    cambiarDescuentoItem(item.clave, parsearMonto(descuento || '0') ?? 0);
    onCerrar();
  };

  return (
    <Hoja visible titulo={item.nombre} onCerrar={onCerrar}>
      <Campo
        etiqueta={item.unidad === 'kg' ? 'Kilos' : 'Cantidad'}
        keyboardType="decimal-pad"
        value={cantidad}
        onChangeText={setCantidad}
      />
      <Campo
        etiqueta="Descuento en pesos (opcional)"
        keyboardType="number-pad"
        placeholder="$0"
        value={descuento}
        onChangeText={(v) => setDescuento(v.replace(/\D/g, ''))}
      />
      <View style={estilos.botones}>
        <Boton titulo="Guardar" onPress={guardar} />
        <Boton
          titulo="Quitar de la venta"
          variante="peligro"
          onPress={() => {
            quitar(item.clave);
            onCerrar();
          }}
        />
      </View>
    </Hoja>
  );
}

/** Cobrar algo que no está en el catálogo (ej. pan a granel, recarga). */
function HojaMontoLibre({ visible, onCerrar }: { visible: boolean; onCerrar: () => void }) {
  const agregarMontoLibre = useCarrito((s) => s.agregarMontoLibre);
  const [nombre, setNombre] = useState('');
  const [monto, setMonto] = useState('');
  const valor = parsearMonto(monto || '0') ?? 0;

  const agregar = () => {
    if (valor <= 0) return;
    agregarMontoLibre(nombre, valor);
    setNombre('');
    setMonto('');
    onCerrar();
  };

  return (
    <Hoja visible={visible} titulo="Monto libre" onCerrar={onCerrar}>
      <Campo
        etiqueta="Monto"
        keyboardType="number-pad"
        placeholder="$0"
        autoFocus
        value={monto}
        onChangeText={(v) => setMonto(v.replace(/\D/g, ''))}
        ayuda={valor ? formatearCLP(valor) : undefined}
      />
      <Campo
        etiqueta="Detalle (opcional)"
        placeholder="Varios"
        value={nombre}
        onChangeText={setNombre}
      />
      <Boton titulo="Agregar" deshabilitado={valor <= 0} onPress={agregar} />
    </Hoja>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  flex: { flex: 1 },
  espacio: { height: 12 },
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
  entrada: { flex: 1, minHeight: 52, fontSize: 17, color: colores.texto },
  botonIcono: {
    width: 60,
    borderRadius: radios.pastilla,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primario,
  },
  aviso: {
    marginHorizontal: 12,
    marginTop: 4,
    padding: 12,
    borderRadius: radios.chico,
    backgroundColor: colores.fondoError,
  },
  textoAviso: { fontSize: 15, color: colores.error },
  cajaCerrada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginTop: 4,
    padding: 12,
    borderRadius: radios.chico,
    backgroundColor: colores.fondoAviso,
  },
  textoCaja: { fontSize: 15, color: colores.aviso },
  lista: { padding: 12, flexGrow: 1 },
  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 10,
    borderRadius: radios.medio,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  presionado: { opacity: 0.6 },
  nombre: { fontSize: 17, fontWeight: '600', color: colores.texto },
  detalle: { marginTop: 2, fontSize: 14, color: colores.textoSecundario },
  precio: { fontSize: 18, fontWeight: '700', color: colores.texto },
  vacioCarrito: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  vacio: { textAlign: 'center', fontSize: 16, color: colores.textoSecundario },
  promo: { marginTop: 2, fontSize: 13, fontWeight: '600', color: colores.exito },
  promoInactiva: { fontWeight: '400', color: colores.textoSecundario },
  envase: { marginTop: 4, fontSize: 13, color: colores.primario },
  linea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    marginBottom: 10,
    borderRadius: radios.medio,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  sinStock: { marginTop: 2, fontSize: 12, color: colores.aviso },
  cantidad: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  botonCantidad: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colores.primarioSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numero: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: colores.texto,
  },
  totalLinea: {
    minWidth: 72,
    textAlign: 'right',
    fontSize: 17,
    fontWeight: '700',
    color: colores.texto,
  },
  pie: {
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  accionesPie: { flexDirection: 'row', gap: 20 },
  enlace: { fontSize: 16, fontWeight: '600', color: colores.primario },
  peligro: { color: colores.error },
  rapidos: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  botones: { gap: 10 },
});
