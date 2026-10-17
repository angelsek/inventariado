import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { obtenerCajaAbierta } from '@/db/cajas';
import { obtenerNegocio } from '@/db/negocio';
import { buscarPorCodigo, listarProductos, type Producto } from '@/db/productos';
import { useBase } from '@/db/proveedor';
import { registrarVenta } from '@/db/ventas';
import { dentroDelHorario } from '@/features/alcohol/horario';
import { MAX_ENTRE_TECLAS_MS } from '@/features/escaner/pistola';
import { useLectorCodigos } from '@/features/escaner/useLectorCodigos';
import { bloqueadoPorSuscripcion } from '@/features/suscripcion/useSoloLectura';
import {
  calcularTotales,
  etiquetaMedio,
  type MedioPago,
  montosRapidos,
  revisarPagos,
  totalItem,
} from '@/features/ventas/calculos';
import { useCarrito } from '@/features/ventas/carrito';
import { avisar, hayDialogoAbierto } from '@/lib/dialogo';
import { formatearCLP } from '@/lib/formato';
import { formatearCantidad, parsearCantidad, parsearMonto } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores, radios } from '@/theme/colores';
import { crearMemoriaRecibido, leerMultiplicador } from '@/web/pos/cobro';
import { accionDeTecla, TECLA_DE_MEDIO, TECLAS_PAGO } from '@/web/pos/teclado';

type Ventana = null | 'kilos' | 'montoLibre' | 'descuento';
type Aviso = { tipo: 'exito' | 'error'; texto: string; ventaId?: string };

const soloDigitos = (v: string) => v.replace(/\D/g, '');
const MEDIOS_RAPIDOS = Object.values(TECLAS_PAGO);

/**
 * Caja del PC (versión web): venta tipo POS con pistola USB y teclado.
 * El buscador siempre recibe el foco; la pistola agrega productos desde cualquier parte,
 * y nunca escribe en el monto recibido. Atajos en web/pos/teclado.ts.
 */
export default function VenderPos() {
  const db = useBase();
  const negocioId = useSesion((s) => s.negocioId);
  const datosCambiaron = useSesion((s) => s.datosCambiaron);
  const carrito = useCarrito();
  const { subtotal, descuento, total } = calcularTotales(carrito.items, carrito.descuentoGeneral);

  const buscador = useRef<TextInput>(null);
  const [busqueda, setBusqueda] = useState('');
  const busquedaActual = useRef('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [marcado, setMarcado] = useState(0);
  const [seleccion, setSeleccion] = useState(0);
  const [modo, setModo] = useState<'venta' | 'cobro'>('venta');
  const [medio, setMedio] = useState<MedioPago>('efectivo');
  const [recibido, setRecibido] = useState('');
  const memoriaRecibido = useRef(crearMemoriaRecibido(MAX_ENTRE_TECLAS_MS));
  const [ventana, setVentana] = useState<Ventana>(null);
  const [pesando, setPesando] = useState<Producto | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cajaAbierta, setCajaAbierta] = useState(true);
  const [enFoco, setEnFoco] = useState(false);

  const enfocarBuscador = useCallback(() => {
    setTimeout(() => buscador.current?.focus(), 0);
  }, []);

  const cambiarBusqueda = (texto: string) => {
    busquedaActual.current = texto;
    setBusqueda(texto);
    setMarcado(0);
  };

  useFocusEffect(
    useCallback(() => {
      setEnFoco(true);
      enfocarBuscador();
      if (negocioId) {
        obtenerAutor(db)
          .then(({ dispositivoId }) => obtenerCajaAbierta(db, negocioId, dispositivoId))
          .then((caja) => setCajaAbierta(!!caja))
          .catch(() => setCajaAbierta(true));
      }
      return () => setEnFoco(false);
    }, [db, negocioId, enfocarBuscador]),
  );

  // Búsqueda por nombre o código (sin el multiplicador "3*").
  const textoBuscado = busqueda.replace(/^\s*\d+(?:[.,]\d+)?\s*\*\s*/, '').trim();
  useEffect(() => {
    if (!negocioId || textoBuscado.length < 2) return;
    let vigente = true;
    // Espera a que se deje de escribir: la pistola teclea el código entero en milisegundos.
    const espera = setTimeout(() => {
      listarProductos(db, negocioId, { busqueda: textoBuscado })
        .then((lista) => {
          if (vigente) setResultados(lista.slice(0, 8));
        })
        .catch(() => {});
    }, 120);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [db, negocioId, textoBuscado]);
  const sugerencias = textoBuscado.length >= 2 ? resultados : [];

  const items = carrito.items;
  const filaSeleccionada = Math.min(seleccion, Math.max(items.length - 1, 0));

  const agregar = (producto: Producto, cantidad = 1) => {
    cambiarBusqueda('');
    setAviso(null);
    if (producto.unidad === 'kg') {
      setPesando(producto);
      setVentana('kilos');
      return;
    }
    carrito.agregarProducto(producto, cantidad);
    const indice = useCarrito.getState().items.findIndex((i) => i.productoId === producto.id);
    setSeleccion(indice);
    enfocarBuscador();
  };

  const agregarPorCodigo = async (codigo: string, cantidad: number) => {
    if (!negocioId) return;
    const producto = await buscarPorCodigo(db, negocioId, codigo);
    if (!producto || !producto.activo) {
      cambiarBusqueda('');
      setAviso({ tipo: 'error', texto: `El código ${codigo} no está en el catálogo.` });
      return;
    }
    agregar(producto, cantidad);
  };

  // Pistola USB: en venta agrega el producto; durante el cobro se borra lo que alcanzó a
  // escribir en el monto recibido y se avisa.
  useLectorCodigos(
    (codigo) => {
      if (modo === 'cobro') {
        setRecibido(memoriaRecibido.current.antesDeLaRafaga());
        cambiarBusqueda('');
        setAviso({ tipo: 'error', texto: 'Termina el cobro antes de agregar otro producto.' });
        return;
      }
      void agregarPorCodigo(codigo, leerMultiplicador(busquedaActual.current));
    },
    enFoco && ventana === null,
  );

  const iniciarCobro = (nuevo: MedioPago) => {
    if (items.length === 0) return;
    setMedio(nuevo);
    setModo('cobro');
    setAviso(null);
    if (nuevo !== 'efectivo') setRecibido('');
  };

  const volverAVenta = () => {
    setModo('venta');
    setRecibido('');
    enfocarBuscador();
  };

  const recibidoNumero = recibido ? parsearMonto(recibido) : null;
  const revision = revisarPagos(
    total,
    [{ medio, monto: total }],
    medio === 'efectivo' ? recibidoNumero : null,
  );

  // Mientras se confirma o registra una venta no se acepta otra confirmación (evita ventas
  // duplicadas con dos Enter seguidos o con el aviso de alcohol abierto).
  const cobrando = useRef(false);

  const registrar = async () => {
    // Se lee el carro al momento: el de este render pudo quedar viejo mientras se esperaba.
    const { items: itemsVenta, descuentoGeneral } = useCarrito.getState();
    const totalVenta = calcularTotales(itemsVenta, descuentoGeneral).total;
    const pagos = revisarPagos(
      totalVenta,
      [{ medio, monto: totalVenta }],
      medio === 'efectivo' ? recibidoNumero : null,
    );
    if (!negocioId || itemsVenta.length === 0 || !pagos.ok) {
      cobrando.current = false;
      return;
    }
    setGuardando(true);
    try {
      const autor = await obtenerAutor(db);
      const caja = await obtenerCajaAbierta(db, negocioId, autor.dispositivoId);
      const ventaId = await registrarVenta(db, {
        negocioId,
        items: itemsVenta,
        descuentoGeneral,
        pagos: pagos.pagos,
        efectivoRecibido: pagos.efectivoRecibido,
        vuelto: pagos.vuelto,
        cajaId: caja?.id ?? null,
        autor,
      });
      useCarrito.getState().vaciar();
      datosCambiaron();
      sincronizarAhora(db);
      setAviso({
        tipo: 'exito',
        texto: `Venta registrada: ${formatearCLP(totalVenta)}${
          pagos.vuelto ? ` · Vuelto ${formatearCLP(pagos.vuelto)}` : ''
        }`,
        ventaId,
      });
      setSeleccion(0);
      volverAVenta();
    } catch (e) {
      setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setGuardando(false);
      cobrando.current = false;
    }
  };

  const confirmar = async () => {
    if (cobrando.current || !negocioId) return;
    if (bloqueadoPorSuscripcion()) return;
    if (!revision.ok) {
      setAviso({ tipo: 'error', texto: revision.error });
      return;
    }
    cobrando.current = true;
    if (carrito.items.some((i) => i.alcohol)) {
      try {
        const negocio = await obtenerNegocio(db, negocioId);
        const fuera = !dentroDelHorario(
          new Date(),
          negocio?.alcoholDesde ?? null,
          negocio?.alcoholHasta ?? null,
        );
        avisar(
          'Venta de alcohol',
          (fuera
            ? `Atención: estás fuera del horario de venta de alcohol (${negocio?.alcoholDesde} a ${negocio?.alcoholHasta}).\n\n`
            : '') + 'Confirma que el cliente es mayor de 18 años.',
          [
            {
              text: 'Cancelar',
              style: 'cancel',
              onPress: () => {
                cobrando.current = false;
              },
            },
            { text: 'Es mayor de 18', onPress: () => void registrar() },
          ],
        );
      } catch (e) {
        cobrando.current = false;
        setAviso({ tipo: 'error', texto: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    await registrar();
  };

  const cancelarVenta = () =>
    avisar('Cancelar la venta', 'Se quitan todos los productos de la venta en curso.', [
      { text: 'Seguir vendiendo', style: 'cancel', onPress: enfocarBuscador },
      {
        text: 'Cancelar venta',
        style: 'destructive',
        onPress: () => {
          carrito.vaciar();
          volverAVenta();
        },
      },
    ]);

  // Atajos de teclado de toda la pantalla.
  const ejecutar = useRef<(e: KeyboardEvent) => void>(() => {});
  const ultimaTecla = useRef(-Infinity);
  const manejarTecla = (evento: KeyboardEvent) => {
    const anterior = ultimaTecla.current;
    ultimaTecla.current = evento.timeStamp;
    if (evento.defaultPrevented) return;
    if (!enFoco || ventana !== null || hayDialogoAbierto()) return;
    const accion = accionDeTecla(evento, {
      modo,
      buscadorConTexto: busquedaActual.current.trim() !== '',
      hayItems: items.length > 0,
    });
    if (!accion) return;
    evento.preventDefault();
    const item = items[filaSeleccionada];
    switch (accion.tipo) {
      case 'buscar':
        buscador.current?.focus();
        return;
      case 'montoLibre':
        setVentana('montoLibre');
        return;
      case 'descuento':
        setVentana('descuento');
        return;
      case 'abrirCaja':
        router.push('/caja');
        return;
      case 'otrosPagos':
        router.push('/cobrar');
        return;
      case 'cobrar':
        iniciarCobro(accion.medio);
        return;
      case 'mover':
        setSeleccion(Math.min(Math.max(filaSeleccionada + accion.paso, 0), items.length - 1));
        return;
      case 'cantidad':
        // Un + o − dentro de una ráfaga es parte de un código de la pistola, no un atajo.
        if (evento.timeStamp - anterior <= MAX_ENTRE_TECLAS_MS) return;
        if (item) {
          const paso = item.unidad === 'kg' ? 0.1 : 1;
          carrito.cambiarCantidad(item.clave, item.cantidad + accion.paso * paso);
        }
        return;
      case 'quitar':
        if (item) carrito.quitar(item.clave);
        return;
      case 'cancelar':
        if (modo === 'cobro') volverAVenta();
        else cancelarVenta();
        return;
      case 'confirmar':
        // Un Enter pegado a la tecla anterior es el final de una lectura de la pistola,
        // no la persona confirmando el cobro.
        if (evento.timeStamp - anterior <= MAX_ENTRE_TECLAS_MS) return;
        void confirmar();
        return;
    }
  };
  useEffect(() => {
    ejecutar.current = manejarTecla;
  });
  useEffect(() => {
    // En captura: los campos de texto de react-native-web no dejan subir algunas teclas (Enter).
    const alTeclear = (e: KeyboardEvent) => ejecutar.current(e);
    window.addEventListener('keydown', alTeclear, true);
    return () => window.removeEventListener('keydown', alTeclear, true);
  }, []);

  // Enter y flechas en el buscador: elegir entre las sugerencias o buscar el código exacto.
  const teclaEnBuscador = (tecla: string) => {
    if (tecla === 'ArrowDown' && sugerencias.length) {
      setMarcado((m) => Math.min(m + 1, sugerencias.length - 1));
    } else if (tecla === 'ArrowUp' && sugerencias.length) {
      setMarcado((m) => Math.max(m - 1, 0));
    }
  };
  const enterEnBuscador = () => {
    const elegido = sugerencias[marcado];
    if (elegido) {
      agregar(elegido, leerMultiplicador(busquedaActual.current));
    } else if (/^\d{4,}$/.test(textoBuscado)) {
      void agregarPorCodigo(textoBuscado, leerMultiplicador(busquedaActual.current));
    }
  };

  return (
    <View style={estilos.pantalla}>
      <View style={estilos.izquierda}>
        <View style={estilos.barraBusqueda}>
          <Ionicons name="barcode-outline" size={26} color={colores.primario} />
          <TextInput
            ref={buscador}
            accessibilityLabel="Código o nombre del producto"
            placeholder="Escanea o escribe el nombre del producto (F3)"
            placeholderTextColor={colores.inactivo}
            value={busqueda}
            onChangeText={cambiarBusqueda}
            onKeyPress={(e) => teclaEnBuscador(e.nativeEvent.key)}
            onSubmitEditing={enterEnBuscador}
            blurOnSubmit={false}
            style={estilos.entradaBusqueda}
          />
          {busqueda ? (
            <Pressable accessibilityLabel="Borrar búsqueda" onPress={() => cambiarBusqueda('')}>
              <Ionicons name="close-circle" size={22} color={colores.inactivo} />
            </Pressable>
          ) : null}
        </View>

        {sugerencias.length ? (
          <View style={estilos.sugerencias}>
            {sugerencias.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => agregar(p, leerMultiplicador(busquedaActual.current))}
                style={[estilos.sugerencia, i === marcado && estilos.sugerenciaMarcada]}
              >
                <Text style={estilos.textoSugerencia} numberOfLines={1}>
                  {p.nombre}
                </Text>
                <Text style={estilos.detalleSugerencia}>
                  {p.codigoBarras ?? 'Sin código'} · Stock {formatearCantidad(p.stock)}
                </Text>
                <Text style={estilos.precioSugerencia}>{formatearCLP(p.precioVenta)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {!cajaAbierta ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/caja')}
            style={estilos.cajaCerrada}
          >
            <Ionicons name="lock-closed-outline" size={18} color={colores.aviso} />
            <Text style={estilos.textoCaja}>Caja cerrada. Ábrela para cuadrar el turno (F7).</Text>
          </Pressable>
        ) : null}

        {aviso ? (
          <Pressable
            onPress={() => setAviso(null)}
            style={[
              estilos.aviso,
              aviso.tipo === 'exito' ? estilos.avisoExito : estilos.avisoError,
            ]}
          >
            <Text
              style={[
                estilos.textoAviso,
                { color: aviso.tipo === 'exito' ? colores.exito : colores.error },
              ]}
            >
              {aviso.texto}
            </Text>
            {aviso.ventaId ? (
              <Text
                accessibilityRole="link"
                style={estilos.enlace}
                onPress={() =>
                  router.push({ pathname: '/venta/[id]', params: { id: aviso.ventaId! } })
                }
              >
                Ver comprobante
              </Text>
            ) : null}
          </Pressable>
        ) : null}

        <View style={estilos.tabla}>
          <View style={[estilos.filaTabla, estilos.encabezado]}>
            <Text style={[estilos.celda, estilos.colProducto, estilos.textoEncabezado]}>
              Producto
            </Text>
            <Text style={[estilos.celda, estilos.colCantidad, estilos.textoEncabezado]}>
              Cantidad
            </Text>
            <Text style={[estilos.celda, estilos.colPrecio, estilos.textoEncabezado]}>Precio</Text>
            <Text style={[estilos.celda, estilos.colPrecio, estilos.textoEncabezado]}>
              Subtotal
            </Text>
            <View style={estilos.colAcciones} />
          </View>
          <ScrollView>
            {items.length === 0 ? (
              <Text style={estilos.vacio}>
                Escanea un producto o escribe su nombre para empezar la venta.
              </Text>
            ) : null}
            {items.map((item, i) => (
              <Pressable
                key={item.clave}
                onPress={() => setSeleccion(i)}
                style={[estilos.filaTabla, i === filaSeleccionada && estilos.filaSeleccionada]}
              >
                <View style={[estilos.celda, estilos.colProducto]}>
                  <Text style={estilos.textoProducto} numberOfLines={1}>
                    {item.nombre}
                  </Text>
                  {item.descuento > 0 ? (
                    <Text style={estilos.detalle}>Descuento {formatearCLP(item.descuento)}</Text>
                  ) : null}
                </View>
                <View style={[estilos.celda, estilos.colCantidad, estilos.cantidad]}>
                  <Pressable
                    accessibilityLabel={`Restar ${item.nombre}`}
                    onPress={() =>
                      carrito.cambiarCantidad(
                        item.clave,
                        item.cantidad - (item.unidad === 'kg' ? 0.1 : 1),
                      )
                    }
                    style={estilos.botonCantidad}
                  >
                    <Ionicons name="remove" size={18} color={colores.primario} />
                  </Pressable>
                  <Text style={estilos.textoCantidad}>
                    {formatearCantidad(item.cantidad)}
                    {item.unidad === 'kg' ? ' kg' : ''}
                  </Text>
                  <Pressable
                    accessibilityLabel={`Sumar ${item.nombre}`}
                    onPress={() =>
                      carrito.cambiarCantidad(
                        item.clave,
                        item.cantidad + (item.unidad === 'kg' ? 0.1 : 1),
                      )
                    }
                    style={estilos.botonCantidad}
                  >
                    <Ionicons name="add" size={18} color={colores.primario} />
                  </Pressable>
                </View>
                <Text style={[estilos.celda, estilos.colPrecio]}>
                  {formatearCLP(item.precioUnitario)}
                </Text>
                <Text style={[estilos.celda, estilos.colPrecio, estilos.textoSubtotal]}>
                  {formatearCLP(totalItem(item))}
                </Text>
                <Pressable
                  accessibilityLabel={`Quitar ${item.nombre}`}
                  onPress={() => carrito.quitar(item.clave)}
                  style={estilos.colAcciones}
                >
                  <Ionicons name="trash-outline" size={20} color={colores.error} />
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <Text style={estilos.ayudaTeclas}>
          ↑ ↓ elegir fila · + / − cantidad · Supr quitar · 3* y escanea para agregar 3 · F4 monto
          libre · F6 descuento · Esc cancelar
        </Text>
      </View>

      <View style={estilos.derecha}>
        <Text style={estilos.etiquetaTotal}>Total</Text>
        <Text style={estilos.total}>{formatearCLP(total)}</Text>
        <Text style={estilos.detalleTotal}>
          {items.length} producto(s)
          {descuento > 0
            ? ` · Subtotal ${formatearCLP(subtotal)} · Descuento ${formatearCLP(descuento)}`
            : ''}
        </Text>

        {modo === 'venta' ? (
          <View style={estilos.medios}>
            {MEDIOS_RAPIDOS.map((m) => (
              <BotonMedio
                key={m}
                medio={m}
                deshabilitado={items.length === 0}
                onPress={() => iniciarCobro(m)}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              disabled={items.length === 0}
              onPress={() => router.push('/cobrar')}
              style={estilos.otros}
            >
              <Text style={estilos.textoOtros}>Fiado o pago mixto (F8)</Text>
            </Pressable>
          </View>
        ) : (
          <View style={estilos.cobro}>
            <Text style={estilos.etiquetaCobro}>Cobrar con {etiquetaMedio(medio)}</Text>
            <View style={estilos.chips}>
              {MEDIOS_RAPIDOS.map((m) => (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  onPress={() => iniciarCobro(m)}
                  style={[estilos.chip, m === medio && estilos.chipActivo]}
                >
                  <Text style={[estilos.textoChip, m === medio && estilos.textoChipActivo]}>
                    {etiquetaMedio(m)} ({TECLA_DE_MEDIO[m]})
                  </Text>
                </Pressable>
              ))}
            </View>
            {medio === 'efectivo' ? (
              <>
                <Campo
                  etiqueta="Efectivo recibido"
                  autoFocus
                  inputMode="numeric"
                  placeholder={`${formatearCLP(total)} (exacto)`}
                  value={recibido ? formatearCLP(Number(recibido)) : ''}
                  onChangeText={(v) => {
                    memoriaRecibido.current.cambio(recibido, performance.now());
                    setRecibido(soloDigitos(v).slice(0, 9));
                  }}
                  style={estilos.entradaRecibido}
                />
                <View style={estilos.chips}>
                  {montosRapidos(total).map((monto) => (
                    <Pressable
                      key={monto}
                      accessibilityRole="button"
                      onPress={() => setRecibido(String(monto))}
                      style={[estilos.chip, recibidoNumero === monto && estilos.chipActivo]}
                    >
                      <Text
                        style={[
                          estilos.textoChip,
                          recibidoNumero === monto && estilos.textoChipActivo,
                        ]}
                      >
                        {monto === total ? 'Exacto' : formatearCLP(monto)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={estilos.vuelto}>
                  <Text style={estilos.etiquetaVuelto}>Vuelto</Text>
                  <Text style={estilos.montoVuelto}>
                    {revision.ok ? formatearCLP(revision.vuelto ?? 0) : '—'}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={estilos.notaCobro}>
                Cobra {formatearCLP(total)} en la máquina y confirma cuando el pago salga aprobado.
              </Text>
            )}
            {!revision.ok && recibido ? <Text style={estilos.falta}>{revision.error}</Text> : null}
            <Boton
              titulo={`Confirmar venta (Enter)`}
              onPress={() => void confirmar()}
              cargando={guardando}
              deshabilitado={!revision.ok}
            />
            <Boton titulo="Volver (Esc)" variante="secundario" onPress={volverAVenta} />
          </View>
        )}
      </View>

      <VentanaKilos
        producto={ventana === 'kilos' ? pesando : null}
        onCerrar={() => {
          setVentana(null);
          setPesando(null);
          enfocarBuscador();
        }}
        onAgregar={(producto, kilos) => {
          carrito.agregarProducto(producto, kilos);
          setVentana(null);
          setPesando(null);
          enfocarBuscador();
        }}
      />
      <VentanaMonto
        visible={ventana === 'montoLibre'}
        titulo="Monto libre"
        conNombre
        onCerrar={() => {
          setVentana(null);
          enfocarBuscador();
        }}
        onAceptar={(monto, nombre) => {
          carrito.agregarMontoLibre(nombre, monto);
          setVentana(null);
          enfocarBuscador();
        }}
      />
      <VentanaMonto
        visible={ventana === 'descuento'}
        titulo="Descuento a toda la venta"
        onCerrar={() => {
          setVentana(null);
          enfocarBuscador();
        }}
        onAceptar={(monto) => {
          carrito.cambiarDescuentoGeneral(monto);
          setVentana(null);
          enfocarBuscador();
        }}
      />
    </View>
  );
}

function BotonMedio({
  medio,
  deshabilitado,
  onPress,
}: {
  medio: MedioPago;
  deshabilitado: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cobrar con ${etiquetaMedio(medio)}`}
      disabled={deshabilitado}
      onPress={onPress}
      style={[estilos.medio, deshabilitado && estilos.medioDeshabilitado]}
    >
      <Text style={estilos.textoMedio}>{etiquetaMedio(medio)}</Text>
      <Text style={estilos.teclaMedio}>{TECLA_DE_MEDIO[medio]}</Text>
    </Pressable>
  );
}

function VentanaKilos({
  producto,
  onCerrar,
  onAgregar,
}: {
  producto: Producto | null;
  onCerrar: () => void;
  onAgregar: (producto: Producto, kilos: number) => void;
}) {
  const [texto, setTexto] = useState('');
  const kilos = parsearCantidad(texto);
  const aceptar = () => {
    if (producto && kilos && kilos > 0) {
      onAgregar(producto, kilos);
      setTexto('');
    }
  };
  return (
    <Modal visible={!!producto} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={estilos.fondoVentana}>
        <View style={estilos.ventana}>
          <Text style={estilos.tituloVentana}>{producto?.nombre}</Text>
          <Campo
            etiqueta={`Kilos (${formatearCLP(producto?.precioVenta ?? 0)} el kilo)`}
            autoFocus
            inputMode="decimal"
            placeholder="Ej: 0,5"
            value={texto}
            onChangeText={setTexto}
            onSubmitEditing={aceptar}
            ayuda={
              kilos && producto
                ? `Total: ${formatearCLP(Math.round(kilos * producto.precioVenta))}`
                : undefined
            }
          />
          <Boton titulo="Agregar (Enter)" onPress={aceptar} deshabilitado={!kilos || kilos <= 0} />
          <Boton titulo="Cancelar (Esc)" variante="secundario" onPress={onCerrar} />
        </View>
      </View>
    </Modal>
  );
}

function VentanaMonto({
  visible,
  titulo,
  conNombre,
  onCerrar,
  onAceptar,
}: {
  visible: boolean;
  titulo: string;
  conNombre?: boolean;
  onCerrar: () => void;
  onAceptar: (monto: number, nombre: string) => void;
}) {
  const [monto, setMonto] = useState('');
  const [nombre, setNombre] = useState('');
  const valor = parsearMonto(monto || '0') ?? 0;
  const aceptar = () => {
    if (valor <= 0 && conNombre) return;
    onAceptar(valor, nombre);
    setMonto('');
    setNombre('');
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCerrar}>
      <View style={estilos.fondoVentana}>
        <View style={estilos.ventana}>
          <Text style={estilos.tituloVentana}>{titulo}</Text>
          <Campo
            etiqueta="Monto"
            autoFocus
            inputMode="numeric"
            placeholder="$0"
            value={monto ? formatearCLP(Number(monto)) : ''}
            onChangeText={(v) => setMonto(soloDigitos(v))}
            onSubmitEditing={aceptar}
          />
          {conNombre ? (
            <Campo
              etiqueta="Detalle (opcional)"
              placeholder="Ej: Varios"
              value={nombre}
              onChangeText={setNombre}
              onSubmitEditing={aceptar}
            />
          ) : null}
          <Boton titulo="Aceptar (Enter)" onPress={aceptar} />
          <Boton titulo="Cancelar (Esc)" variante="secundario" onPress={onCerrar} />
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, flexDirection: 'row', backgroundColor: colores.fondo },
  izquierda: { flex: 1, padding: 20, gap: 12 },
  derecha: {
    width: 380,
    padding: 24,
    gap: 12,
    backgroundColor: colores.superficie,
    borderLeftWidth: 1,
    borderLeftColor: colores.borde,
  },
  barraBusqueda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 60,
    borderRadius: radios.chico,
    borderWidth: 2,
    borderColor: colores.primario,
    backgroundColor: colores.superficie,
  },
  entradaBusqueda: { flex: 1, fontSize: 20, color: colores.texto, outlineStyle: 'none' } as never,
  sugerencias: {
    borderRadius: radios.chico,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
    overflow: 'hidden',
  },
  sugerencia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sugerenciaMarcada: { backgroundColor: colores.primarioSuave },
  textoSugerencia: { flex: 1, fontSize: 17, color: colores.texto },
  detalleSugerencia: { fontSize: 14, color: colores.textoSecundario },
  precioSugerencia: {
    width: 100,
    textAlign: 'right',
    fontSize: 17,
    fontWeight: '700',
    color: colores.texto,
  },
  cajaCerrada: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: radios.chico,
    backgroundColor: colores.fondoAviso,
  },
  textoCaja: { fontSize: 16, color: colores.aviso, fontWeight: '600' },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radios.chico,
  },
  avisoExito: { backgroundColor: colores.fondoExito },
  avisoError: { backgroundColor: colores.fondoError },
  textoAviso: { fontSize: 17, fontWeight: '600' },
  enlace: { fontSize: 16, fontWeight: '600', color: colores.primario },
  tabla: {
    flex: 1,
    borderRadius: radios.chico,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
    overflow: 'hidden',
  },
  filaTabla: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  encabezado: { minHeight: 40, backgroundColor: colores.fondo },
  textoEncabezado: { fontSize: 14, fontWeight: '700', color: colores.textoSecundario },
  filaSeleccionada: { backgroundColor: colores.primarioSuave },
  celda: { paddingHorizontal: 8, fontSize: 17, color: colores.texto },
  colProducto: { flex: 1 },
  colCantidad: { width: 170 },
  colPrecio: { width: 120, textAlign: 'right' },
  colAcciones: { width: 44, alignItems: 'center' },
  textoProducto: { fontSize: 17, color: colores.texto },
  detalle: { fontSize: 14, color: colores.textoSecundario },
  cantidad: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  botonCantidad: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primarioSuave,
  },
  textoCantidad: { minWidth: 56, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  textoSubtotal: { fontWeight: '700' },
  vacio: { padding: 24, fontSize: 17, color: colores.textoSecundario, textAlign: 'center' },
  ayudaTeclas: { fontSize: 13, color: colores.textoSecundario },
  etiquetaTotal: { fontSize: 18, color: colores.textoSecundario },
  total: { fontSize: 56, fontWeight: '800', color: colores.texto },
  detalleTotal: { fontSize: 15, color: colores.textoSecundario },
  medios: { gap: 10, marginTop: 12 },
  medio: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    minHeight: 60,
    borderRadius: radios.chico,
    backgroundColor: colores.primario,
  },
  medioDeshabilitado: { opacity: 0.4 },
  textoMedio: { fontSize: 20, fontWeight: '700', color: colores.superficie },
  teclaMedio: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 15,
    fontWeight: '700',
    color: colores.primario,
    backgroundColor: colores.superficie,
  },
  otros: { alignItems: 'center', paddingVertical: 12 },
  textoOtros: { fontSize: 16, fontWeight: '600', color: colores.primario },
  cobro: { gap: 12, marginTop: 8 },
  etiquetaCobro: { fontSize: 20, fontWeight: '700', color: colores.texto },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radios.pastilla,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  textoChip: { fontSize: 15, color: colores.texto },
  textoChipActivo: { color: colores.superficie, fontWeight: '700' },
  entradaRecibido: { fontSize: 28, fontWeight: '700', minHeight: 64 },
  vuelto: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: radios.chico,
    backgroundColor: colores.fondoExito,
  },
  etiquetaVuelto: { fontSize: 20, fontWeight: '600', color: colores.exito },
  montoVuelto: { fontSize: 32, fontWeight: '800', color: colores.exito },
  notaCobro: { fontSize: 16, color: colores.textoSecundario },
  falta: { fontSize: 16, color: colores.error, fontWeight: '600' },
  fondoVentana: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  ventana: {
    width: 440,
    gap: 10,
    padding: 24,
    borderRadius: radios.grande,
    backgroundColor: colores.superficie,
  },
  tituloVentana: { fontSize: 22, fontWeight: '700', color: colores.texto, marginBottom: 8 },
});
