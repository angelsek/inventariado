import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { BuscadorProductos } from '@/components/BuscadorProductos';
import { Campo } from '@/components/Campo';
import { Escaner } from '@/components/Escaner';
import { Formulario } from '@/components/Formulario';
import { Hoja } from '@/components/Hoja';
import { Selector } from '@/components/Selector';
import { type Categoria, crearCategoria, listarCategorias } from '@/db/categorias';
import {
  actualizarProducto,
  buscarPorCodigo,
  cambiarActivoProducto,
  crearProducto,
  obtenerProducto,
  type Producto,
  type Unidad,
  UNIDADES,
} from '@/db/productos';
import { AjusteStock } from '@/features/inventario/AjusteStock';
import { HistorialStock } from '@/features/inventario/HistorialStock';
import { formatearCLP } from '@/lib/formato';
import { formatearCantidad, parsearCantidad, parsearMonto } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';
import { bloqueadoPorSuscripcion } from '@/features/suscripcion/useSoloLectura';

type Form = {
  nombre: string;
  codigoBarras: string;
  categoriaId: string | null;
  unidad: Unidad;
  precioVenta: string;
  costo: string;
  stockInicial: string;
  stockMinimo: string;
  precioEnvase: string;
  promoCantidad: string;
  promoPrecio: string;
  packProductoId: string | null;
  packNombre: string;
  packCantidad: string;
};

type Errores = Partial<Record<keyof Form, string>>;

const soloDigitos = (texto: string) => texto.replace(/\D/g, '');

export default function ProductoScreen() {
  const { id, codigo } = useLocalSearchParams<{ id: string; codigo?: string }>();
  const esNuevo = id === 'nuevo';
  const db = useSQLiteContext();
  const { negocioId, perfil, versionDatos, datosCambiaron } = useSesion();
  const esDueno = perfil?.rol === 'dueno';

  const [producto, setProducto] = useState<Producto | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [form, setForm] = useState<Form>({
    nombre: '',
    codigoBarras: codigo ?? '',
    categoriaId: null,
    unidad: 'unidad',
    precioVenta: '',
    costo: '',
    stockInicial: '',
    stockMinimo: '',
    precioEnvase: '',
    promoCantidad: '',
    promoPrecio: '',
    packProductoId: null,
    packNombre: '',
    packCantidad: '',
  });
  const [eligiendoBase, setEligiendoBase] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState(false);
  const [versionStock, setVersionStock] = useState(0);

  useEffect(() => {
    if (negocioId) listarCategorias(db, negocioId).then(setCategorias);
  }, [db, negocioId, versionDatos]);

  useEffect(() => {
    if (esNuevo) return;
    obtenerProducto(db, id).then((p) => {
      setProducto(p);
      if (p) {
        setForm((f) => ({
          ...f,
          nombre: p.nombre,
          codigoBarras: p.codigoBarras ?? '',
          categoriaId: p.categoriaId,
          unidad: p.unidad,
          precioVenta: String(p.precioVenta),
          costo: String(p.costo),
          stockMinimo: p.stockMinimo ? formatearCantidad(p.stockMinimo) : '',
          precioEnvase: p.precioEnvase ? String(p.precioEnvase) : '',
          promoCantidad: p.promoCantidad ? String(p.promoCantidad) : '',
          promoPrecio: p.promoPrecio !== null ? String(p.promoPrecio) : '',
          packProductoId: p.packProductoId,
          packCantidad: p.packCantidad ? formatearCantidad(p.packCantidad) : '',
        }));
        if (p.packProductoId) {
          obtenerProducto(db, p.packProductoId).then((base) =>
            setForm((f) => ({ ...f, packNombre: base?.nombre ?? 'Producto eliminado' })),
          );
        }
      }
    });
    // Solo al abrir: una sincronización no debe borrar lo que se está editando.
  }, [db, id, esNuevo]);

  const cambiar = (cambios: Partial<Form>) => setForm((f) => ({ ...f, ...cambios }));

  if (!esNuevo && !producto) {
    return (
      <Formulario titulo="Producto">
        <Text style={estilos.nota}>Cargando...</Text>
      </Formulario>
    );
  }

  if (!esDueno) {
    return producto ? <DetalleSoloLectura producto={producto} /> : null;
  }

  const agregarCategoria = async () => {
    if (!nuevaCategoria?.trim()) return setNuevaCategoria(null);
    const categoria = await crearCategoria(db, negocioId!, nuevaCategoria);
    setCategorias(await listarCategorias(db, negocioId!));
    cambiar({ categoriaId: categoria.id });
    setNuevaCategoria(null);
  };

  const guardar = async () => {
    if (bloqueadoPorSuscripcion()) return;
    const nuevos: Errores = {};
    const precioVenta = parsearMonto(form.precioVenta || '0');
    const costo = parsearMonto(form.costo || '0');
    const stockInicial = parsearCantidad(form.stockInicial || '0');
    const stockMinimo = parsearCantidad(form.stockMinimo || '0');

    if (!form.nombre.trim()) nuevos.nombre = 'Ingresa el nombre.';
    if (precioVenta === null) nuevos.precioVenta = 'Precio no válido.';
    if (costo === null) nuevos.costo = 'Costo no válido.';
    if (stockInicial === null || stockInicial < 0) nuevos.stockInicial = 'Cantidad no válida.';
    if (stockMinimo === null || stockMinimo < 0) nuevos.stockMinimo = 'Cantidad no válida.';

    const precioEnvase = parsearMonto(form.precioEnvase || '0');
    if (precioEnvase === null) nuevos.precioEnvase = 'Precio no válido.';
    const promoCantidad = form.promoCantidad ? Number(form.promoCantidad) : null;
    const promoPrecio = form.promoPrecio ? parsearMonto(form.promoPrecio) : null;
    if (form.promoCantidad || form.promoPrecio) {
      if (!promoCantidad || promoCantidad < 2) nuevos.promoCantidad = 'Desde 2 unidades.';
      if (promoPrecio === null) nuevos.promoPrecio = 'Ingresa el precio de la promo.';
    }
    const packCantidad = form.packProductoId ? parsearCantidad(form.packCantidad) : null;
    if (form.packProductoId && (!packCantidad || packCantidad <= 0)) {
      nuevos.packCantidad = '¿Cuántas unidades trae?';
    }

    const codigoBarras = form.codigoBarras.trim() || null;
    if (codigoBarras) {
      const otro = await buscarPorCodigo(db, negocioId!, codigoBarras);
      if (otro && otro.id !== producto?.id) {
        nuevos.codigoBarras = `Ya lo usa "${otro.nombre}".`;
      }
    }

    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setGuardando(true);
    setError(null);
    try {
      const datos = {
        nombre: form.nombre,
        codigoBarras,
        categoriaId: form.categoriaId,
        precioVenta: precioVenta!,
        costo: costo!,
        stockMinimo: stockMinimo!,
        unidad: form.unidad,
        precioEnvase: precioEnvase!,
        promoCantidad: promoCantidad && promoPrecio !== null ? promoCantidad : null,
        promoPrecio: promoCantidad && promoPrecio !== null ? promoPrecio : null,
        packProductoId: form.packProductoId,
        packCantidad: form.packProductoId ? packCantidad : null,
      };
      if (esNuevo) {
        await crearProducto(db, negocioId!, datos, stockInicial!, await obtenerAutor(db));
      } else {
        await actualizarProducto(db, producto!.id, datos);
      }
      datosCambiaron();
      sincronizarAhora(db);
      router.back();
    } catch (e) {
      setError(String(e));
      setGuardando(false);
    }
  };

  const precio = parsearMonto(form.precioVenta || '0') ?? 0;
  const costoActual = parsearMonto(form.costo || '0') ?? 0;
  const margen =
    precio > 0 && costoActual > 0
      ? `Ganancia: ${formatearCLP(precio - costoActual)} (${Math.round(((precio - costoActual) / precio) * 100)}%)`
      : undefined;

  return (
    <>
      <Stack.Screen options={{ title: esNuevo ? 'Nuevo producto' : 'Editar producto' }} />
      <Formulario titulo={esNuevo ? 'Nuevo producto' : form.nombre || 'Producto'} error={error}>
        <Campo
          etiqueta="Nombre"
          placeholder="Ej: Cerveza lata 470cc"
          value={form.nombre}
          onChangeText={(nombre) => cambiar({ nombre })}
          error={errores.nombre}
        />

        <Campo
          etiqueta="Código de barras (opcional)"
          keyboardType="number-pad"
          value={form.codigoBarras}
          onChangeText={(codigoBarras) => cambiar({ codigoBarras })}
          error={errores.codigoBarras}
        />
        <View style={estilos.espacio}>
          <Boton
            titulo="Escanear código"
            variante="secundario"
            onPress={() => setEscaneando(true)}
          />
        </View>

        <Text style={estilos.etiqueta}>Categoría</Text>
        <Selector
          opciones={[
            { valor: null as string | null, etiqueta: 'Sin categoría' },
            ...categorias.map((c) => ({ valor: c.id as string | null, etiqueta: c.nombre })),
          ]}
          valor={form.categoriaId}
          onCambio={(categoriaId) => cambiar({ categoriaId })}
        />
        {nuevaCategoria === null ? (
          <Text
            accessibilityRole="button"
            style={estilos.enlace}
            onPress={() => setNuevaCategoria('')}
          >
            + Nueva categoría
          </Text>
        ) : (
          <View style={estilos.nuevaCategoria}>
            <TextInput
              accessibilityLabel="Nombre de la categoría"
              autoFocus
              placeholder="Nombre de la categoría"
              placeholderTextColor={colores.inactivo}
              value={nuevaCategoria}
              onChangeText={setNuevaCategoria}
              onSubmitEditing={agregarCategoria}
              style={estilos.entradaCategoria}
            />
            <Text accessibilityRole="button" style={estilos.enlace} onPress={agregarCategoria}>
              Agregar
            </Text>
          </View>
        )}

        <Text style={[estilos.etiqueta, estilos.separado]}>Se vende por</Text>
        <Selector
          opciones={UNIDADES}
          valor={form.unidad}
          onCambio={(unidad) => cambiar({ unidad })}
        />

        <View style={[estilos.dosColumnas, estilos.separado]}>
          <View style={estilos.columna}>
            <Campo
              etiqueta={form.unidad === 'kg' ? 'Precio por kilo' : 'Precio de venta'}
              keyboardType="number-pad"
              placeholder="$0"
              value={form.precioVenta}
              onChangeText={(v) => cambiar({ precioVenta: soloDigitos(v) })}
              ayuda={precio ? formatearCLP(precio) : undefined}
              error={errores.precioVenta}
            />
          </View>
          <View style={estilos.columna}>
            <Campo
              etiqueta="Costo"
              keyboardType="number-pad"
              placeholder="$0"
              value={form.costo}
              onChangeText={(v) => cambiar({ costo: soloDigitos(v) })}
              ayuda={costoActual ? formatearCLP(costoActual) : undefined}
              error={errores.costo}
            />
          </View>
        </View>
        {margen ? <Text style={estilos.margen}>{margen}</Text> : null}

        <Text style={[estilos.etiqueta, estilos.separado]}>Pack de otro producto (opcional)</Text>
        {form.packProductoId ? (
          <View style={estilos.dosColumnas}>
            <View style={estilos.columna}>
              <Text style={estilos.nota}>Descuenta stock de:</Text>
              <Text style={estilos.textoPack}>{form.packNombre}</Text>
              <Text
                accessibilityRole="button"
                style={[estilos.enlace, estilos.peligro]}
                onPress={() => cambiar({ packProductoId: null, packNombre: '', packCantidad: '' })}
              >
                No es un pack
              </Text>
            </View>
            <View style={estilos.columna}>
              <Campo
                etiqueta="Unidades del pack"
                keyboardType="decimal-pad"
                placeholder="6"
                value={form.packCantidad}
                onChangeText={(packCantidad) => cambiar({ packCantidad })}
                error={errores.packCantidad}
              />
            </View>
          </View>
        ) : (
          <>
            <Text style={estilos.nota}>
              Ej: un six-pack con su propio código y precio, que al venderse descuenta 6 latas.
            </Text>
            <Text
              accessibilityRole="button"
              style={estilos.enlace}
              onPress={() => setEligiendoBase(true)}
            >
              Elegir el producto que contiene
            </Text>
          </>
        )}

        <Text style={[estilos.etiqueta, estilos.separado]}>Promoción por cantidad (opcional)</Text>
        <View style={estilos.dosColumnas}>
          <View style={estilos.columna}>
            <Campo
              etiqueta="Llevando"
              keyboardType="number-pad"
              placeholder="3"
              value={form.promoCantidad}
              onChangeText={(v) => cambiar({ promoCantidad: soloDigitos(v) })}
              error={errores.promoCantidad}
            />
          </View>
          <View style={estilos.columna}>
            <Campo
              etiqueta="Pagan"
              keyboardType="number-pad"
              placeholder="$2.000"
              value={form.promoPrecio}
              onChangeText={(v) => cambiar({ promoPrecio: soloDigitos(v) })}
              error={errores.promoPrecio}
            />
          </View>
        </View>
        {form.promoCantidad && form.promoPrecio ? (
          <Text style={estilos.margen}>
            Promo: {form.promoCantidad} x {formatearCLP(parsearMonto(form.promoPrecio) ?? 0)}
          </Text>
        ) : null}

        <Campo
          etiqueta="Envase retornable (opcional)"
          keyboardType="number-pad"
          placeholder="$0"
          value={form.precioEnvase}
          onChangeText={(v) => cambiar({ precioEnvase: soloDigitos(v) })}
          ayuda="Precio del envase: se cobra aparte si el cliente no trae el vacío."
          error={errores.precioEnvase}
        />

        <View style={estilos.dosColumnas}>
          {esNuevo && form.packProductoId ? (
            <View style={estilos.columna}>
              <Text style={estilos.nota}>El stock de un pack es el de su producto base.</Text>
            </View>
          ) : esNuevo ? (
            <View style={estilos.columna}>
              <Campo
                etiqueta="Stock inicial"
                keyboardType="decimal-pad"
                placeholder="0"
                value={form.stockInicial}
                onChangeText={(stockInicial) => cambiar({ stockInicial })}
                error={errores.stockInicial}
              />
            </View>
          ) : (
            <View style={estilos.columna}>
              <Text style={estilos.etiqueta}>Stock actual</Text>
              <Text style={estilos.stockActual}>
                {formatearCantidad(producto!.stock)}
                {producto!.unidad === 'kg' ? ' kg' : ''}
              </Text>
              {producto!.packProductoId ? (
                <Text style={estilos.nota}>Packs completos según el stock del producto base.</Text>
              ) : (
                <Text
                  accessibilityRole="button"
                  style={estilos.enlace}
                  onPress={() => setAjustando(true)}
                >
                  Ajustar stock
                </Text>
              )}
            </View>
          )}
          <View style={estilos.columna}>
            <Campo
              etiqueta="Avisar si baja de"
              keyboardType="decimal-pad"
              placeholder="0"
              value={form.stockMinimo}
              onChangeText={(stockMinimo) => cambiar({ stockMinimo })}
              error={errores.stockMinimo}
            />
          </View>
        </View>

        {!esNuevo ? (
          <View style={estilos.activo}>
            <View style={estilos.columna}>
              <Text style={estilos.etiqueta}>Producto activo</Text>
              <Text style={estilos.nota}>Los desactivados no aparecen para los cajeros.</Text>
            </View>
            <Switch
              accessibilityLabel="Producto activo"
              value={producto!.activo}
              onValueChange={async (activo) => {
                await cambiarActivoProducto(db, producto!.id, activo);
                setProducto({ ...producto!, activo });
                datosCambiaron();
                sincronizarAhora(db);
              }}
            />
          </View>
        ) : null}

        <Boton titulo="Guardar" onPress={guardar} cargando={guardando} />
        {!esNuevo ? <HistorialStock productoId={producto!.id} version={versionStock} /> : null}
      </Formulario>

      <Hoja
        visible={eligiendoBase}
        titulo="¿Qué producto trae el pack?"
        onCerrar={() => setEligiendoBase(false)}
      >
        <BuscadorProductos
          onElegir={(base) => {
            if (base.id === producto?.id) return;
            if (base.packProductoId) {
              setError('Ese producto ya es un pack: elige el producto individual.');
            } else {
              cambiar({ packProductoId: base.id, packNombre: base.nombre });
            }
            setEligiendoBase(false);
          }}
        />
      </Hoja>

      {!esNuevo ? (
        <AjusteStock
          producto={producto!}
          visible={ajustando}
          onCerrar={() => setAjustando(false)}
          onListo={async () => {
            setAjustando(false);
            const actualizado = await obtenerProducto(db, producto!.id);
            if (actualizado) setProducto(actualizado);
            setVersionStock((v) => v + 1);
            datosCambiaron();
            sincronizarAhora(db);
          }}
        />
      ) : null}

      <Escaner
        visible={escaneando}
        onCodigo={(codigoBarras) => {
          setEscaneando(false);
          cambiar({ codigoBarras });
        }}
        onCerrar={() => setEscaneando(false)}
      />
    </>
  );
}

/** Lo que ve un cajero: sin costo y sin poder editar. */
function DetalleSoloLectura({ producto }: { producto: Producto }) {
  const filas: [string, string][] = [
    ['Precio', formatearCLP(producto.precioVenta) + (producto.unidad === 'kg' ? ' / kg' : '')],
    ['Stock', formatearCantidad(producto.stock) + (producto.unidad === 'kg' ? ' kg' : '')],
    ['Categoría', producto.categoria ?? 'Sin categoría'],
    ['Código de barras', producto.codigoBarras ?? '-'],
    ...(producto.promoCantidad && producto.promoPrecio !== null
      ? [
          ['Promoción', `${producto.promoCantidad} x ${formatearCLP(producto.promoPrecio)}`] as [
            string,
            string,
          ],
        ]
      : []),
    ...(producto.precioEnvase
      ? [['Envase', formatearCLP(producto.precioEnvase)] as [string, string]]
      : []),
  ];
  return (
    <>
      <Stack.Screen options={{ title: 'Producto' }} />
      <Formulario titulo={producto.nombre}>
        <View style={estilos.tarjeta}>
          {filas.map(([etiqueta, valor], i) => (
            <View key={etiqueta} style={[estilos.filaDetalle, i > 0 && estilos.borde]}>
              <Text style={estilos.etiquetaDetalle}>{etiqueta}</Text>
              <Text style={estilos.valorDetalle}>{valor}</Text>
            </View>
          ))}
        </View>
      </Formulario>
    </>
  );
}

const estilos = StyleSheet.create({
  espacio: { marginTop: -4, marginBottom: 20 },
  etiqueta: { marginBottom: 6, fontSize: 14, fontWeight: '500', color: colores.texto },
  separado: { marginTop: 16 },
  enlace: { marginTop: 8, fontSize: 15, color: colores.primario },
  peligro: { color: colores.error },
  textoPack: { marginTop: 2, fontSize: 15, fontWeight: '600', color: colores.texto },
  nuevaCategoria: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  entradaCategoria: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colores.texto,
    backgroundColor: colores.superficie,
  },
  dosColumnas: { flexDirection: 'row', gap: 12 },
  columna: { flex: 1 },
  margen: { marginTop: -8, marginBottom: 16, fontSize: 14, color: colores.exito },
  stockActual: { fontSize: 22, fontWeight: '700', color: colores.texto },
  nota: { fontSize: 13, color: colores.textoSecundario },
  activo: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  tarjeta: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  filaDetalle: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  borde: { borderTopWidth: 1, borderTopColor: colores.borde },
  etiquetaDetalle: { fontSize: 15, color: colores.textoSecundario },
  valorDetalle: { fontSize: 16, fontWeight: '600', color: colores.texto },
});
