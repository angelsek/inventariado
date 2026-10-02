import Ionicons from '@expo/vector-icons/Ionicons';
import { useSQLiteContext } from 'expo-sqlite';
import { type ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Barras } from '@/components/Barras';
import { Boton } from '@/components/Boton';
import { Selector } from '@/components/Selector';
import { generarReporte, type Inventario, type Reporte, valorizarInventario } from '@/db/reportes';
import { compartirArchivo } from '@/features/exportar/compartir';
import { csvReporte } from '@/features/reportes/csv';
import {
  calcularPeriodo,
  claveDia,
  esPeriodoActual,
  etiquetaDia,
  etiquetaPeriodo,
  moverPeriodo,
  type Periodo,
  type TipoPeriodo,
} from '@/features/reportes/periodo';
import { MEDIOS_PAGO } from '@/features/ventas/calculos';
import { informarError } from '@/lib/errores';
import { formatearCLP } from '@/lib/formato';
import { formatearCantidad } from '@/lib/numeros';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

type Vista = 'ventas' | 'productos' | 'inventario';

const porcentaje = (valor: number) => `${Math.round(valor * 100)} %`;

/** Reportes del negocio para el dueño: ventas, productos e inventario. */
export default function EstadisticasScreen() {
  const db = useSQLiteContext();
  const { negocioId, perfil, versionDatos } = useSesion();
  const [periodo, setPeriodo] = useState<Periodo>(() => calcularPeriodo('dia', new Date()));
  const [vista, setVista] = useState<Vista>('ventas');
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [inventario, setInventario] = useState<Inventario | null>(null);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!negocioId) return;
    generarReporte(db, negocioId, periodo).then(setReporte);
  }, [db, negocioId, periodo, versionDatos]);

  useEffect(() => {
    if (negocioId && vista === 'inventario') valorizarInventario(db, negocioId).then(setInventario);
  }, [db, negocioId, vista, versionDatos]);

  if (perfil?.rol !== 'dueno') {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.nota}>Solo el dueño puede ver los reportes.</Text>
      </View>
    );
  }

  const cambiarTipo = (tipo: TipoPeriodo) => setPeriodo(calcularPeriodo(tipo, periodo.inicio));
  const actual = esPeriodoActual(periodo);
  const titulo = etiquetaPeriodo(periodo);

  const exportar = async () => {
    if (!reporte) return;
    setExportando(true);
    setError(null);
    try {
      await compartirArchivo(
        `reporte-${periodo.tipo}-${claveDia(periodo.inicio)}.csv`,
        'text/csv',
        csvReporte(reporte, titulo),
      );
    } catch (e) {
      setError('No se pudo exportar. Inténtalo de nuevo.');
      informarError(e, 'Exportar reporte');
    } finally {
      setExportando(false);
    }
  };

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Selector
        opciones={[
          { valor: 'ventas' as const, etiqueta: 'Ventas' },
          { valor: 'productos' as const, etiqueta: 'Productos' },
          { valor: 'inventario' as const, etiqueta: 'Inventario' },
        ]}
        valor={vista}
        onCambio={setVista}
      />

      {vista !== 'inventario' ? (
        <>
          <View style={estilos.espacio} />
          <Selector
            opciones={[
              { valor: 'dia' as const, etiqueta: 'Día' },
              { valor: 'semana' as const, etiqueta: 'Semana' },
              { valor: 'mes' as const, etiqueta: 'Mes' },
            ]}
            valor={periodo.tipo}
            onCambio={cambiarTipo}
          />
          <View style={estilos.navegacion}>
            <Pressable
              accessibilityLabel="Período anterior"
              onPress={() => setPeriodo(moverPeriodo(periodo, -1))}
            >
              <Ionicons name="chevron-back" size={28} color={colores.primario} />
            </Pressable>
            <Text style={estilos.periodo}>{titulo}</Text>
            <Pressable
              accessibilityLabel="Período siguiente"
              disabled={actual}
              onPress={() => setPeriodo(moverPeriodo(periodo, 1))}
            >
              <Ionicons
                name="chevron-forward"
                size={28}
                color={actual ? colores.borde : colores.primario}
              />
            </Pressable>
          </View>
        </>
      ) : null}

      {error ? <Text style={estilos.error}>{error}</Text> : null}

      {vista === 'ventas' && reporte ? <VistaVentas reporte={reporte} periodo={periodo} /> : null}
      {vista === 'productos' && reporte ? <VistaProductos reporte={reporte} /> : null}
      {vista === 'inventario' && inventario ? <VistaInventario inventario={inventario} /> : null}

      {vista !== 'inventario' && reporte && reporte.cantidad > 0 ? (
        <View style={estilos.espacioGrande}>
          <Boton
            titulo="Exportar a Excel"
            variante="secundario"
            cargando={exportando}
            onPress={exportar}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Tarjeta({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <View style={estilos.tarjeta}>
      {titulo ? <Text style={estilos.tituloTarjeta}>{titulo}</Text> : null}
      {children}
    </View>
  );
}

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.etiquetaDato}>{etiqueta}</Text>
      <Text style={estilos.valorDato}>{valor}</Text>
      {nota ? <Text style={estilos.notaDato}>{nota}</Text> : null}
    </View>
  );
}

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior <= 0) return null;
  const cambio = (actual - anterior) / anterior;
  const sube = cambio >= 0;
  return (
    <Text style={[estilos.variacion, { color: sube ? colores.exito : colores.error }]}>
      {sube ? '▲' : '▼'} {porcentaje(Math.abs(cambio))} vs. período anterior (
      {formatearCLP(anterior)})
    </Text>
  );
}

function VistaVentas({ reporte, periodo }: { reporte: Reporte; periodo: Periodo }) {
  if (reporte.cantidad === 0 && reporte.anuladas.cantidad === 0) {
    return <Text style={estilos.vacio}>No hay ventas en este período.</Text>;
  }
  const horaTop = [...reporte.porHora].sort((a, b) => b.monto - a.monto)[0];
  return (
    <>
      <Tarjeta>
        <Text style={estilos.etiquetaDato}>Total vendido</Text>
        <Text style={estilos.total}>{formatearCLP(reporte.total)}</Text>
        <Variacion actual={reporte.total} anterior={reporte.anterior.total} />
        <View style={estilos.datos}>
          <Dato etiqueta="Ventas" valor={String(reporte.cantidad)} />
          <Dato etiqueta="Ticket promedio" valor={formatearCLP(reporte.ticketPromedio)} />
          <Dato
            etiqueta="Ganancia"
            valor={formatearCLP(reporte.ganancia)}
            nota={`Margen ${porcentaje(reporte.margen)}`}
          />
        </View>
        {reporte.itemsSinCosto > 0 ? (
          <Text style={estilos.aviso}>
            {reporte.itemsSinCosto} producto(s) vendido(s) sin costo registrado: la ganancia real es
            menor. Completa los costos en Inventario.
          </Text>
        ) : null}
        {reporte.descuentos > 0 || reporte.anuladas.cantidad > 0 ? (
          <Text style={estilos.nota}>
            {reporte.descuentos > 0 ? `Descuentos: ${formatearCLP(reporte.descuentos)}. ` : ''}
            {reporte.anuladas.cantidad > 0
              ? `Anuladas: ${reporte.anuladas.cantidad} (${formatearCLP(reporte.anuladas.monto)}).`
              : ''}
          </Text>
        ) : null}
      </Tarjeta>

      {periodo.tipo !== 'dia' ? (
        <Tarjeta titulo="Por día">
          <Barras
            destacarMayor
            filas={reporte.porDia.map((d) => ({
              clave: claveDia(d.dia),
              etiqueta: etiquetaDia(d.dia),
              monto: d.monto,
              detalle: d.cantidad ? `${d.cantidad} venta(s)` : undefined,
            }))}
          />
        </Tarjeta>
      ) : null}

      {reporte.porHora.length > 0 ? (
        <Tarjeta titulo="Por hora">
          {horaTop ? (
            <Text style={estilos.nota}>
              Hora de más venta: {horaTop.hora}:00 a {horaTop.hora + 1}:00
            </Text>
          ) : null}
          <View style={estilos.espacio} />
          <Barras
            destacarMayor
            filas={reporte.porHora.map((h) => ({
              clave: String(h.hora),
              etiqueta: `${String(h.hora).padStart(2, '0')}:00`,
              monto: h.monto,
              detalle: `${h.cantidad} venta(s)`,
            }))}
          />
        </Tarjeta>
      ) : null}

      <Tarjeta titulo="Medios de pago">
        <Barras
          filas={MEDIOS_PAGO.filter((m) => reporte.porMedio[m.valor] > 0).map((m) => ({
            clave: m.valor,
            etiqueta: m.etiqueta,
            monto: reporte.porMedio[m.valor],
            detalle:
              reporte.total > 0 ? porcentaje(reporte.porMedio[m.valor] / reporte.total) : undefined,
          }))}
        />
      </Tarjeta>

      <Tarjeta titulo="Por cajero">
        <Barras
          filas={reporte.porCajero.map((c) => ({
            clave: c.nombre,
            etiqueta: c.nombre,
            monto: c.monto,
            detalle: `${c.cantidad} venta(s)`,
          }))}
        />
      </Tarjeta>

      {reporte.porCategoria.length > 0 ? (
        <Tarjeta titulo="Por categoría">
          <Barras
            filas={reporte.porCategoria.map((c) => ({
              clave: c.nombre,
              etiqueta: c.nombre,
              monto: c.monto,
            }))}
          />
        </Tarjeta>
      ) : null}
    </>
  );
}

function VistaProductos({ reporte }: { reporte: Reporte }) {
  const [verSinVentas, setVerSinVentas] = useState(false);
  const mas = reporte.productos.slice(0, 10);
  // Menos vendidos: solo tiene sentido si hay más productos que los del top.
  const menos =
    reporte.productos.length > 10
      ? [...reporte.productos].sort((a, b) => a.cantidad - b.cantidad).slice(0, 10)
      : [];
  const sinVentas = verSinVentas ? reporte.sinVentas : reporte.sinVentas.slice(0, 10);

  return (
    <>
      <Tarjeta titulo="Más vendidos">
        {mas.length === 0 ? (
          <Text style={estilos.nota}>No hay ventas en este período.</Text>
        ) : (
          <Barras
            destacarMayor
            filas={mas.map((p) => ({
              clave: p.productoId ?? p.nombre,
              etiqueta: p.nombre,
              monto: p.monto,
              detalle: `${formatearCantidad(p.cantidad)} ${p.unidad === 'kg' ? 'kg' : 'u.'} · ganancia ${formatearCLP(p.ganancia)}`,
            }))}
          />
        )}
      </Tarjeta>

      {menos.length > 0 ? (
        <Tarjeta titulo="Menos vendidos">
          {menos.map((p) => (
            <View key={p.productoId ?? p.nombre} style={estilos.filaLista}>
              <Text style={estilos.nombreLista} numberOfLines={1}>
                {p.nombre}
              </Text>
              <Text style={estilos.valorLista}>
                {formatearCantidad(p.cantidad)} {p.unidad === 'kg' ? 'kg' : 'u.'}
              </Text>
            </View>
          ))}
        </Tarjeta>
      ) : null}

      <Tarjeta titulo={`Sin ventas en el período (${reporte.sinVentas.length})`}>
        <Text style={estilos.nota}>
          Productos con stock que no se vendieron. Valor a costo de lo que está en bodega.
        </Text>
        {sinVentas.map((p) => (
          <View key={p.id} style={estilos.filaLista}>
            <Text style={estilos.nombreLista} numberOfLines={1}>
              {p.nombre}
            </Text>
            <Text style={estilos.valorLista}>
              {formatearCantidad(p.stock)} · {formatearCLP(p.valorCosto)}
            </Text>
          </View>
        ))}
        {reporte.sinVentas.length > 10 ? (
          <Text
            accessibilityRole="button"
            style={estilos.enlace}
            onPress={() => setVerSinVentas(!verSinVentas)}
          >
            {verSinVentas ? 'Ver menos' : `Ver los ${reporte.sinVentas.length}`}
          </Text>
        ) : null}
      </Tarjeta>
    </>
  );
}

function VistaInventario({ inventario }: { inventario: Inventario }) {
  const [verTodos, setVerTodos] = useState(false);
  const lista = verTodos ? inventario.productos : inventario.productos.slice(0, 20);
  return (
    <>
      <View style={estilos.espacio} />
      <Tarjeta>
        <Text style={estilos.etiquetaDato}>Mercadería en bodega (a costo)</Text>
        <Text style={estilos.total}>{formatearCLP(inventario.valorCosto)}</Text>
        <View style={estilos.datos}>
          <Dato etiqueta="A precio de venta" valor={formatearCLP(inventario.valorVenta)} />
          <Dato
            etiqueta="Ganancia posible"
            valor={formatearCLP(inventario.valorVenta - inventario.valorCosto)}
          />
          <Dato etiqueta="Productos con stock" valor={String(inventario.productosConStock)} />
        </View>
        {inventario.sinCosto > 0 ? (
          <Text style={estilos.aviso}>
            {inventario.sinCosto} producto(s) sin costo: no suman al valor a costo.
          </Text>
        ) : null}
        {inventario.stockNegativo > 0 ? (
          <Text style={estilos.aviso}>
            {inventario.stockNegativo} producto(s) con stock negativo: conviene hacer un conteo.
          </Text>
        ) : null}
      </Tarjeta>

      <Tarjeta titulo="Margen por producto">
        <Text style={estilos.nota}>
          Primero los de menor margen: revisa si el precio está al día.
        </Text>
        {lista.map((p) => (
          <View key={p.id} style={estilos.filaLista}>
            <View style={estilos.nombreLista}>
              <Text numberOfLines={1} style={estilos.textoLista}>
                {p.nombre}
              </Text>
              <Text style={estilos.nota}>
                {formatearCLP(p.precio)} · costo {p.costo > 0 ? formatearCLP(p.costo) : '—'}
              </Text>
            </View>
            <Text
              style={[
                estilos.valorLista,
                p.margen !== null && p.margen < 0.1 && { color: colores.error },
              ]}
            >
              {p.margen === null ? 'Sin costo' : porcentaje(p.margen)}
            </Text>
          </View>
        ))}
        {inventario.productos.length > 20 ? (
          <Text
            accessibilityRole="button"
            style={estilos.enlace}
            onPress={() => setVerTodos(!verTodos)}
          >
            {verTodos ? 'Ver menos' : `Ver los ${inventario.productos.length}`}
          </Text>
        ) : null}
      </Tarjeta>
    </>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 40 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  espacio: { height: 10 },
  espacioGrande: { marginTop: 16 },
  navegacion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  periodo: { fontSize: 18, fontWeight: '600', color: colores.texto },
  tarjeta: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  tituloTarjeta: { fontSize: 16, fontWeight: '700', color: colores.texto, marginBottom: 10 },
  total: { fontSize: 32, fontWeight: '700', color: colores.texto },
  variacion: { marginTop: 2, fontSize: 13 },
  datos: { flexDirection: 'row', marginTop: 14, gap: 8 },
  dato: { flex: 1 },
  etiquetaDato: { fontSize: 13, color: colores.textoSecundario },
  valorDato: { marginTop: 2, fontSize: 17, fontWeight: '700', color: colores.texto },
  notaDato: { fontSize: 12, color: colores.textoSecundario },
  aviso: { marginTop: 12, fontSize: 13, color: colores.aviso },
  nota: { marginTop: 4, fontSize: 13, color: colores.textoSecundario },
  vacio: { marginTop: 24, textAlign: 'center', fontSize: 15, color: colores.textoSecundario },
  error: { marginBottom: 12, color: colores.error },
  filaLista: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.borde,
  },
  nombreLista: { flex: 1, fontSize: 14, color: colores.texto },
  textoLista: { fontSize: 14, color: colores.texto },
  valorLista: { fontSize: 14, fontWeight: '600', color: colores.texto },
  enlace: { marginTop: 10, fontSize: 14, color: colores.primario },
});
