import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { BuscadorProductos } from '@/components/BuscadorProductos';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { Selector } from '@/components/Selector';
import { registrarCompra, totalItemCompra } from '@/db/compras';
import type { Producto } from '@/db/productos';
import { guardarProveedor, listarProveedores, type Proveedor } from '@/db/proveedores';
import { formatearCLP } from '@/lib/formato';
import { formatearCantidad, parsearCantidad, parsearMonto } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';
import { bloqueadoPorSuscripcion } from '@/features/suscripcion/useSoloLectura';

type Linea = { producto: Producto; cantidad: string; costo: string };

/** Ingreso de mercadería: suma stock y (opcionalmente) actualiza costos. */
export default function CompraScreen() {
  const db = useSQLiteContext();
  const { negocioId, datosCambiaron } = useSesion();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [nuevoProveedor, setNuevoProveedor] = useState<string | null>(null);
  const [documento, setDocumento] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [actualizarCostos, setActualizarCostos] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (negocioId) listarProveedores(db, negocioId).then(setProveedores);
  }, [db, negocioId]);

  const agregar = (producto: Producto) =>
    setLineas((actuales) => {
      const existente = actuales.find((l) => l.producto.id === producto.id);
      if (existente) {
        const cantidad = (parsearCantidad(existente.cantidad) ?? 0) + 1;
        return actuales.map((l) =>
          l === existente ? { ...l, cantidad: formatearCantidad(cantidad) } : l,
        );
      }
      return [{ producto, cantidad: '1', costo: String(producto.costo || '') }, ...actuales];
    });

  const cambiar = (productoId: string, cambios: Partial<Linea>) =>
    setLineas((actuales) =>
      actuales.map((l) => (l.producto.id === productoId ? { ...l, ...cambios } : l)),
    );

  const agregarProveedor = async () => {
    if (!nuevoProveedor?.trim()) return setNuevoProveedor(null);
    const proveedor = await guardarProveedor(db, negocioId!, {
      nombre: nuevoProveedor,
      rut: '',
      telefono: '',
    });
    setProveedores(await listarProveedores(db, negocioId!));
    setProveedorId(proveedor.id);
    setNuevoProveedor(null);
  };

  const items = lineas.map((l) => ({
    productoId: l.producto.id,
    nombre: l.producto.nombre,
    cantidad: parsearCantidad(l.cantidad) ?? 0,
    costoUnitario: parsearMonto(l.costo || '0') ?? 0,
  }));
  const total = items.reduce((suma, item) => suma + totalItemCompra(item), 0);

  const guardar = async () => {
    if (bloqueadoPorSuscripcion()) return;
    if (items.length === 0) return setError('Agrega al menos un producto.');
    if (items.some((i) => i.cantidad <= 0))
      return setError('Revisa las cantidades: deben ser mayores que cero.');
    setGuardando(true);
    setError(null);
    try {
      await registrarCompra(db, {
        negocioId: negocioId!,
        proveedorId,
        documento,
        items,
        actualizarCostos,
        autor: await obtenerAutor(db),
      });
      datosCambiaron();
      sincronizarAhora(db);
      router.back();
    } catch (e) {
      setError(String(e));
      setGuardando(false);
    }
  };

  return (
    <Formulario
      titulo="Ingreso de mercadería"
      subtitulo="Lo que llega del proveedor suma al stock."
      error={error}
    >
      <Text style={estilos.etiqueta}>Proveedor (opcional)</Text>
      <Selector
        opciones={[
          { valor: null as string | null, etiqueta: 'Sin proveedor' },
          ...proveedores.map((p) => ({ valor: p.id as string | null, etiqueta: p.nombre })),
        ]}
        valor={proveedorId}
        onCambio={setProveedorId}
      />
      {nuevoProveedor === null ? (
        <Text
          accessibilityRole="button"
          style={estilos.enlace}
          onPress={() => setNuevoProveedor('')}
        >
          + Nuevo proveedor
        </Text>
      ) : (
        <View style={estilos.fila}>
          <TextInput
            accessibilityLabel="Nombre del proveedor"
            autoFocus
            placeholder="Nombre del proveedor"
            placeholderTextColor={colores.inactivo}
            value={nuevoProveedor}
            onChangeText={setNuevoProveedor}
            onSubmitEditing={agregarProveedor}
            style={estilos.entrada}
          />
          <Text accessibilityRole="button" style={estilos.enlace} onPress={agregarProveedor}>
            Agregar
          </Text>
        </View>
      )}

      <View style={estilos.separado}>
        <Campo
          etiqueta="N° de factura o guía (opcional)"
          value={documento}
          onChangeText={setDocumento}
        />
      </View>

      <Text style={estilos.etiqueta}>Productos</Text>
      <BuscadorProductos onElegir={agregar} escanerContinuo />

      {lineas.map((l) => {
        const cantidad = parsearCantidad(l.cantidad) ?? 0;
        const costo = parsearMonto(l.costo || '0') ?? 0;
        return (
          <View key={l.producto.id} style={estilos.linea}>
            <View style={estilos.encabezadoLinea}>
              <Text style={estilos.nombre}>{l.producto.nombre}</Text>
              <Text
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${l.producto.nombre}`}
                style={estilos.quitar}
                onPress={() => setLineas((a) => a.filter((x) => x !== l))}
              >
                Quitar
              </Text>
            </View>
            <View style={estilos.fila}>
              <View style={estilos.columna}>
                <Campo
                  etiqueta={l.producto.unidad === 'kg' ? 'Kilos' : 'Cantidad'}
                  accessibilityLabel={`Cantidad de ${l.producto.nombre}`}
                  keyboardType="decimal-pad"
                  value={l.cantidad}
                  onChangeText={(cantidad) => cambiar(l.producto.id, { cantidad })}
                />
              </View>
              <View style={estilos.columna}>
                <Campo
                  etiqueta="Costo unitario"
                  accessibilityLabel={`Costo de ${l.producto.nombre}`}
                  keyboardType="number-pad"
                  placeholder="$0"
                  value={l.costo}
                  onChangeText={(v) => cambiar(l.producto.id, { costo: v.replace(/\D/g, '') })}
                  ayuda={formatearCLP(Math.round(cantidad * costo))}
                />
              </View>
            </View>
          </View>
        );
      })}

      <View style={estilos.opcion}>
        <View style={estilos.columna}>
          <Text style={estilos.etiqueta}>Actualizar costos</Text>
          <Text style={estilos.nota}>El costo de cada producto pasa a ser el de este ingreso.</Text>
        </View>
        <Switch
          accessibilityLabel="Actualizar costos"
          value={actualizarCostos}
          onValueChange={setActualizarCostos}
        />
      </View>

      <Boton
        titulo={lineas.length ? `Guardar ingreso ${formatearCLP(total)}` : 'Guardar ingreso'}
        onPress={guardar}
        cargando={guardando}
        deshabilitado={lineas.length === 0}
      />
      <Text
        accessibilityRole="button"
        style={[estilos.enlace, estilos.centrado]}
        onPress={() => router.push('/compras')}
      >
        Ver ingresos anteriores
      </Text>
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  etiqueta: { marginBottom: 6, fontSize: 14, fontWeight: '500', color: colores.texto },
  enlace: { marginTop: 8, fontSize: 15, color: colores.primario },
  centrado: { marginTop: 16, textAlign: 'center' },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  columna: { flex: 1 },
  separado: { marginTop: 16 },
  entrada: {
    flex: 1,
    minHeight: 44,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colores.texto,
    backgroundColor: colores.superficie,
  },
  linea: {
    padding: 12,
    paddingBottom: 0,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  encabezadoLinea: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  nombre: { flex: 1, fontSize: 16, fontWeight: '600', color: colores.texto },
  quitar: { fontSize: 14, color: colores.error },
  opcion: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  nota: { fontSize: 13, color: colores.textoSecundario },
});
