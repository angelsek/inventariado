import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Hoja } from '@/components/Hoja';
import {
  abrirCaja,
  type Caja,
  cerrarCaja,
  listarCajasCerradas,
  listarMovimientosCaja,
  type MovimientoCaja,
  obtenerCaja,
  obtenerCajaAbierta,
  registrarMovimientoCaja,
  type ResumenCaja,
  resumirCaja,
} from '@/db/cajas';
import { obtenerNegocio } from '@/db/negocio';
import { MEDIOS_PAGO } from '@/features/ventas/calculos';
import { textoCierre } from '@/features/ventas/cierreCaja';
import { formatearHora } from '@/lib/fechas';
import { formatearCLP, formatearFechaHora } from '@/lib/formato';
import { parsearMonto } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';
import { bloqueadoPorSuscripcion } from '@/features/suscripcion/useSoloLectura';

const soloDigitos = (v: string) => v.replace(/\D/g, '');

export default function CajaScreen() {
  const db = useSQLiteContext();
  const { negocioId, versionDatos, datosCambiaron } = useSesion();
  const [caja, setCaja] = useState<Caja | null>(null);
  const [cargada, setCargada] = useState(false);
  const [resumen, setResumen] = useState<ResumenCaja | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [cerradas, setCerradas] = useState<Caja[]>([]);
  const [montoInicial, setMontoInicial] = useState('');
  const [movimiento, setMovimiento] = useState<'ingreso' | 'retiro' | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const cargarDatos = useCallback(async () => {
    if (!negocioId) return null;
    const { dispositivoId } = await obtenerAutor(db);
    const abierta = await obtenerCajaAbierta(db, negocioId, dispositivoId);
    return {
      caja: abierta,
      resumen: abierta ? await resumirCaja(db, abierta.id) : null,
      movimientos: abierta ? await listarMovimientosCaja(db, abierta.id) : [],
      cerradas: await listarCajasCerradas(db, negocioId, 10),
    };
  }, [db, negocioId]);

  const aplicar = useCallback((datos: Awaited<ReturnType<typeof cargarDatos>>) => {
    if (!datos) return;
    setCaja(datos.caja);
    setResumen(datos.resumen);
    setMovimientos(datos.movimientos);
    setCerradas(datos.cerradas);
    setCargada(true);
  }, []);

  const recargar = useCallback(() => cargarDatos().then(aplicar), [cargarDatos, aplicar]);

  // Recarga al entrar a la pestaña y cuando cambian los datos (ventas, sincronización).
  useFocusEffect(
    useCallback(() => {
      cargarDatos().then(aplicar);
    }, [cargarDatos, aplicar]),
  );
  useEffect(() => {
    cargarDatos().then(aplicar);
  }, [cargarDatos, aplicar, versionDatos]);

  const listo = () => {
    datosCambiaron();
    sincronizarAhora(db);
    recargar();
  };

  const abrir = async () => {
    if (bloqueadoPorSuscripcion()) return;
    await abrirCaja(db, negocioId!, parsearMonto(montoInicial || '0') ?? 0, await obtenerAutor(db));
    setMontoInicial('');
    listo();
  };

  const compartirCierre = async (c: Caja) => {
    const negocio = await obtenerNegocio(db, negocioId!);
    const r = await resumirCaja(db, c.id);
    await Share.share({ message: textoCierre(negocio?.nombre ?? '', c, r) });
  };

  if (!cargada) return <View style={estilos.pantalla} />;

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      {!caja ? (
        <View style={estilos.tarjeta}>
          <View style={estilos.encabezado}>
            <Ionicons name="lock-closed-outline" size={28} color={colores.inactivo} />
            <Text style={estilos.titulo}>Caja cerrada</Text>
          </View>
          <Text style={estilos.nota}>
            Abre la caja al empezar el turno. Las ventas de este teléfono quedarán en ella para
            cuadrar el efectivo al cerrar.
          </Text>
          <View style={estilos.espacio}>
            <Campo
              etiqueta="Efectivo al abrir (sencillo)"
              keyboardType="number-pad"
              placeholder="$0"
              value={montoInicial}
              onChangeText={(v) => setMontoInicial(soloDigitos(v))}
              ayuda={montoInicial ? formatearCLP(Number(montoInicial)) : undefined}
            />
          </View>
          <Boton titulo="Abrir caja" onPress={abrir} />
        </View>
      ) : (
        <>
          <View style={estilos.tarjeta}>
            <View style={estilos.encabezado}>
              <Ionicons name="lock-open-outline" size={28} color={colores.exito} />
              <View style={estilos.flex}>
                <Text style={estilos.titulo}>Caja abierta</Text>
                <Text style={estilos.nota}>
                  Desde las {formatearHora(new Date(caja.abiertaEn))}
                  {caja.abiertaPor ? ` · ${caja.abiertaPor}` : ''}
                </Text>
              </View>
            </View>
            {resumen ? (
              <>
                <Fila etiqueta="Monto inicial" valor={formatearCLP(resumen.montoInicial)} />
                <Fila
                  etiqueta="+ Ventas en efectivo"
                  valor={formatearCLP(resumen.porMedio.efectivo)}
                />
                {resumen.ingresos ? (
                  <Fila etiqueta="+ Ingresos" valor={formatearCLP(resumen.ingresos)} />
                ) : null}
                {resumen.retiros ? (
                  <Fila etiqueta="− Retiros" valor={formatearCLP(resumen.retiros)} />
                ) : null}
                <View style={estilos.esperado}>
                  <Text style={estilos.textoEsperado}>Efectivo en caja</Text>
                  <Text style={estilos.montoEsperado}>
                    {formatearCLP(resumen.efectivoEsperado)}
                  </Text>
                </View>
                <Text style={estilos.subtitulo}>
                  {resumen.cantidadVentas} venta(s) por {formatearCLP(resumen.totalVentas)}
                </Text>
                {MEDIOS_PAGO.filter(
                  (m) => m.valor !== 'efectivo' && resumen.porMedio[m.valor] > 0,
                ).map((m) => (
                  <Fila
                    key={m.valor}
                    etiqueta={m.etiqueta}
                    valor={formatearCLP(resumen.porMedio[m.valor])}
                  />
                ))}
              </>
            ) : null}
          </View>

          {movimientos.length ? (
            <View style={estilos.tarjeta}>
              <Text style={estilos.subtitulo}>Movimientos de efectivo</Text>
              {movimientos.map((m) => (
                <Fila
                  key={m.id}
                  etiqueta={`${formatearHora(new Date(m.creadoEn))} ${m.tipo === 'ingreso' ? 'Ingreso' : 'Retiro'}${m.motivo ? ` · ${m.motivo}` : ''}`}
                  valor={`${m.tipo === 'ingreso' ? '+' : '−'}${formatearCLP(m.monto)}`}
                />
              ))}
            </View>
          ) : null}

          <View style={estilos.botones}>
            <View style={estilos.fila}>
              <View style={estilos.flex}>
                <Boton
                  titulo="Ingreso"
                  variante="secundario"
                  onPress={() => setMovimiento('ingreso')}
                />
              </View>
              <View style={estilos.flex}>
                <Boton
                  titulo="Retiro"
                  variante="secundario"
                  onPress={() => setMovimiento('retiro')}
                />
              </View>
            </View>
            <Boton titulo="Cerrar caja" onPress={() => setCerrando(true)} />
          </View>
        </>
      )}

      {cerradas.length ? (
        <>
          <Text style={estilos.seccion}>Cierres anteriores</Text>
          {cerradas.map((c) => {
            const diferencia = (c.montoContado ?? 0) - (c.efectivoEsperado ?? 0);
            return (
              <View key={c.id} style={estilos.tarjeta}>
                <Text style={estilos.nombre}>{formatearFechaHora(new Date(c.cerradaEn!))}</Text>
                <Text style={estilos.nota}>
                  {[c.abiertaPor, c.cerradaPor].filter(Boolean).join(' → ')}
                </Text>
                <Fila etiqueta="Esperado" valor={formatearCLP(c.efectivoEsperado ?? 0)} />
                <Fila etiqueta="Contado" valor={formatearCLP(c.montoContado ?? 0)} />
                <Fila
                  etiqueta="Diferencia"
                  valor={`${diferencia > 0 ? '+' : ''}${formatearCLP(diferencia)}`}
                  color={
                    diferencia === 0
                      ? colores.exito
                      : diferencia > 0
                        ? colores.aviso
                        : colores.error
                  }
                />
                <Text
                  accessibilityRole="button"
                  style={estilos.enlace}
                  onPress={() => compartirCierre(c)}
                >
                  Compartir cierre
                </Text>
              </View>
            );
          })}
        </>
      ) : null}

      {caja ? (
        <>
          <HojaMovimiento
            tipo={movimiento}
            onCerrar={() => setMovimiento(null)}
            onGuardar={async (monto, motivo) => {
              await registrarMovimientoCaja(db, {
                negocioId: negocioId!,
                cajaId: caja.id,
                tipo: movimiento!,
                monto,
                motivo,
                autor: await obtenerAutor(db),
              });
              setMovimiento(null);
              listo();
            }}
          />
          <HojaCierre
            visible={cerrando}
            esperado={resumen?.efectivoEsperado ?? 0}
            onCerrar={() => setCerrando(false)}
            onConfirmar={async (contado, notas) => {
              await cerrarCaja(db, caja.id, contado, notas, await obtenerAutor(db));
              setCerrando(false);
              listo();
              const cerrada = await obtenerCaja(db, caja.id);
              if (cerrada) compartirCierre(cerrada);
            }}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function Fila({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <View style={estilos.fila}>
      <Text style={[estilos.flex, estilos.etiqueta]}>{etiqueta}</Text>
      <Text style={[estilos.valor, color ? { color } : null]}>{valor}</Text>
    </View>
  );
}

function HojaMovimiento({
  tipo,
  onCerrar,
  onGuardar,
}: {
  tipo: 'ingreso' | 'retiro' | null;
  onCerrar: () => void;
  onGuardar: (monto: number, motivo: string) => void;
}) {
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const valor = parsearMonto(monto || '0') ?? 0;

  return (
    <Hoja
      visible={!!tipo}
      titulo={tipo === 'ingreso' ? 'Ingreso de efectivo' : 'Retiro de efectivo'}
      onCerrar={onCerrar}
    >
      <Campo
        etiqueta="Monto"
        keyboardType="number-pad"
        placeholder="$0"
        value={monto}
        onChangeText={(v) => setMonto(soloDigitos(v))}
        ayuda={valor ? formatearCLP(valor) : undefined}
      />
      <Campo
        etiqueta="Motivo"
        placeholder={tipo === 'ingreso' ? 'Ej: sencillo' : 'Ej: pago a proveedor'}
        value={motivo}
        onChangeText={setMotivo}
      />
      <Boton
        titulo="Guardar"
        deshabilitado={valor <= 0}
        onPress={() => {
          onGuardar(valor, motivo);
          setMonto('');
          setMotivo('');
        }}
      />
    </Hoja>
  );
}

function HojaCierre({
  visible,
  esperado,
  onCerrar,
  onConfirmar,
}: {
  visible: boolean;
  esperado: number;
  onCerrar: () => void;
  onConfirmar: (contado: number, notas: string) => void;
}) {
  const [contado, setContado] = useState('');
  const [notas, setNotas] = useState('');
  const valor = contado === '' ? null : (parsearMonto(contado) ?? 0);
  const diferencia = valor === null ? null : valor - esperado;

  return (
    <Hoja visible={visible} titulo="Cerrar caja" onCerrar={onCerrar}>
      <Text style={estilos.nota}>Cuenta el efectivo que hay en la caja.</Text>
      <View style={estilos.espacio}>
        <Campo
          etiqueta="Efectivo contado"
          keyboardType="number-pad"
          placeholder="$0"
          value={contado}
          onChangeText={(v) => setContado(soloDigitos(v))}
        />
      </View>
      <Fila etiqueta="Esperado" valor={formatearCLP(esperado)} />
      {diferencia !== null ? (
        <Fila
          etiqueta={diferencia === 0 ? 'Cuadra' : diferencia > 0 ? 'Sobra' : 'Falta'}
          valor={formatearCLP(Math.abs(diferencia))}
          color={diferencia === 0 ? colores.exito : diferencia > 0 ? colores.aviso : colores.error}
        />
      ) : null}
      <View style={estilos.espacio}>
        <Campo etiqueta="Notas (opcional)" value={notas} onChangeText={setNotas} />
      </View>
      <Boton
        titulo="Confirmar cierre"
        deshabilitado={valor === null}
        onPress={() => {
          onConfirmar(valor ?? 0, notas);
          setContado('');
          setNotas('');
        }}
      />
    </Hoja>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingBottom: 40 },
  flex: { flex: 1 },
  tarjeta: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  titulo: { fontSize: 20, fontWeight: '700', color: colores.texto },
  subtitulo: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 14,
    fontWeight: '600',
    color: colores.textoSecundario,
  },
  nombre: { fontSize: 16, fontWeight: '600', color: colores.texto },
  nota: { fontSize: 14, color: colores.textoSecundario },
  espacio: { marginTop: 12 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  etiqueta: { fontSize: 15, color: colores.texto },
  valor: { fontSize: 15, fontWeight: '600', color: colores.texto },
  esperado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
  },
  textoEsperado: { fontSize: 17, fontWeight: '600', color: colores.texto },
  montoEsperado: { fontSize: 24, fontWeight: '700', color: colores.texto },
  botones: { gap: 10, marginBottom: 12 },
  seccion: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
  enlace: { marginTop: 8, fontSize: 15, color: colores.primario },
});
