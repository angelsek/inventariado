import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { Hoja } from '@/components/Hoja';
import { Selector } from '@/components/Selector';
import { type Estado, NOMBRE_PLAN } from '@/features/suscripcion/estado';
import { formatearCLP, formatearFecha, formatearFechaHora } from '@/lib/formato';
import { parsearMonto } from '@/lib/numeros';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { colores } from '@/theme/colores';

type NegocioAdmin = {
  id: string;
  nombre: string;
  rut: string | null;
  correo: string | null;
  creado_en: string;
  plan_id: string;
  estado: Estado;
  prueba_hasta: string | null;
  pagado_hasta: string | null;
  suspendida: boolean;
  notas: string | null;
  dispositivos: number;
  ultimo_sync: string | null;
};
type Plan = { id: string; nombre: string; precio_mensual: number };

const COLOR_ESTADO: Record<Estado, string> = {
  prueba: colores.primario,
  activa: colores.exito,
  vencida: colores.aviso,
  suspendida: colores.error,
};
const NOMBRE_ESTADO: Record<Estado, string> = {
  prueba: 'Prueba',
  activa: 'Activa',
  vencida: 'Vencida',
  suspendida: 'Suspendida',
};

/** Panel del administrador de la app: clientes, pagos y suscripciones. */
export default function AdminScreen() {
  const [negocios, setNegocios] = useState<NegocioAdmin[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<NegocioAdmin | null>(null);

  const obtener = useCallback(async () => {
    const [n, p] = await Promise.all([
      supabase.rpc('admin_listar_negocios'),
      supabase.from('planes').select('id, nombre, precio_mensual').order('orden'),
    ]);
    const fallo = n.error ?? p.error;
    return fallo
      ? { error: mensajeDeError(fallo), negocios: [], planes: [] }
      : { error: null, negocios: n.data as NegocioAdmin[], planes: p.data as Plan[] };
  }, []);

  const aplicar = useCallback((d: Awaited<ReturnType<typeof obtener>>) => {
    setError(d.error);
    setNegocios(d.negocios);
    setPlanes(d.planes);
  }, []);

  const recargar = useCallback(() => obtener().then(aplicar), [obtener, aplicar]);

  useEffect(() => {
    obtener().then(aplicar);
  }, [obtener, aplicar]);

  const filtro = busqueda.trim().toLowerCase();
  const visibles = negocios.filter(
    (n) =>
      !filtro ||
      n.nombre.toLowerCase().includes(filtro) ||
      n.correo?.toLowerCase().includes(filtro),
  );
  const conteo = (e: Estado) => negocios.filter((n) => n.estado === e).length;
  const ingresoMensual = negocios
    .filter((n) => n.estado === 'activa')
    .reduce((s, n) => s + (planes.find((p) => p.id === n.plan_id)?.precio_mensual ?? 0), 0);

  return (
    <Formulario titulo="Administración" error={error}>
      <View style={estilos.resumen}>
        {(['activa', 'prueba', 'vencida', 'suspendida'] as Estado[]).map((e) => (
          <View key={e} style={estilos.cifra}>
            <Text style={[estilos.numero, { color: COLOR_ESTADO[e] }]}>{conteo(e)}</Text>
            <Text style={estilos.nota}>{NOMBRE_ESTADO[e]}</Text>
          </View>
        ))}
      </View>
      <Text style={estilos.nota}>
        Ingreso mensual de clientes activos: {formatearCLP(ingresoMensual)}
      </Text>

      <TextInput
        accessibilityLabel="Buscar negocio"
        placeholder="Buscar por nombre o correo"
        placeholderTextColor={colores.inactivo}
        value={busqueda}
        onChangeText={setBusqueda}
        style={estilos.buscador}
      />

      {visibles.map((n) => {
        const vence = n.estado === 'prueba' ? n.prueba_hasta : (n.pagado_hasta ?? n.prueba_hasta);
        return (
          <Pressable
            key={n.id}
            accessibilityRole="button"
            onPress={() => setElegido(n)}
            style={estilos.tarjeta}
          >
            <View style={estilos.fila}>
              <Text style={[estilos.nombre, estilos.flex]}>{n.nombre}</Text>
              <Text style={[estilos.estado, { color: COLOR_ESTADO[n.estado] }]}>
                {NOMBRE_ESTADO[n.estado]}
              </Text>
            </View>
            <Text style={estilos.nota}>{n.correo ?? 'Sin correo'}</Text>
            <Text style={estilos.nota}>
              Plan {NOMBRE_PLAN[n.plan_id] ?? n.plan_id}
              {vence ? ` · vence ${formatearFecha(new Date(vence))}` : ''} · {n.dispositivos}{' '}
              teléfono(s)
            </Text>
            <Text style={estilos.nota}>
              {n.ultimo_sync
                ? `Última conexión: ${formatearFechaHora(new Date(n.ultimo_sync))}`
                : 'Nunca sincronizó'}
            </Text>
          </Pressable>
        );
      })}

      <View style={estilos.espacio}>
        <Boton titulo="Actualizar" variante="secundario" onPress={recargar} />
      </View>

      <HojaNegocio
        key={elegido?.id}
        negocio={elegido}
        planes={planes}
        onCerrar={() => setElegido(null)}
        onListo={() => {
          setElegido(null);
          recargar();
        }}
      />
    </Formulario>
  );
}

function HojaNegocio({
  negocio,
  planes,
  onCerrar,
  onListo,
}: {
  negocio: NegocioAdmin | null;
  planes: Plan[];
  onCerrar: () => void;
  onListo: () => void;
}) {
  const [planId, setPlanId] = useState(negocio?.plan_id ?? 'basico');
  const [meses, setMeses] = useState(1);
  const [monto, setMonto] = useState('');
  const [medio, setMedio] = useState('Transferencia');
  const [notas, setNotas] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  if (!negocio) return null;

  const precio = planes.find((p) => p.id === planId)?.precio_mensual ?? 0;
  const montoFinal = monto ? (parsearMonto(monto) ?? 0) : precio * meses;

  const ejecutar = async (accion: () => PromiseLike<{ error: unknown }>, exito: string) => {
    setTrabajando(true);
    const { error } = await accion();
    setTrabajando(false);
    if (error) return Alert.alert('Error', mensajeDeError(error));
    Alert.alert('Listo', exito);
    setMonto('');
    setNotas('');
    onListo();
  };

  const registrarPago = () =>
    ejecutar(
      () =>
        supabase.rpc('admin_registrar_pago', {
          p_negocio_id: negocio.id,
          p_plan_id: planId,
          p_meses: meses,
          p_monto: montoFinal,
          p_medio: medio,
          p_notas: notas || null,
        }),
      `Pago de ${formatearCLP(montoFinal)} registrado para ${negocio.nombre}.`,
    );

  const actualizar = (cambios: Record<string, unknown>, exito: string) =>
    ejecutar(
      () => supabase.rpc('admin_actualizar_suscripcion', { p_negocio_id: negocio.id, ...cambios }),
      exito,
    );

  return (
    <Hoja visible titulo={negocio.nombre} onCerrar={onCerrar}>
      <Text style={estilos.subtitulo}>Registrar pago</Text>
      <Selector
        opciones={planes.map((p) => ({
          valor: p.id,
          etiqueta: `${p.nombre} ${formatearCLP(p.precio_mensual)}`,
        }))}
        valor={planId}
        onCambio={setPlanId}
      />
      <View style={estilos.espacio}>
        <Selector
          opciones={[1, 3, 6, 12].map((m) => ({
            valor: m,
            etiqueta: m === 1 ? '1 mes' : `${m} meses`,
          }))}
          valor={meses}
          onCambio={setMeses}
        />
      </View>
      <View style={estilos.espacio}>
        <Campo
          etiqueta={`Monto (sugerido ${formatearCLP(precio * meses)})`}
          keyboardType="number-pad"
          placeholder={formatearCLP(precio * meses)}
          value={monto}
          onChangeText={(v) => setMonto(v.replace(/\D/g, ''))}
        />
      </View>
      <Selector
        opciones={['Transferencia', 'Efectivo', 'Otro'].map((m) => ({ valor: m, etiqueta: m }))}
        valor={medio}
        onCambio={setMedio}
      />
      <View style={estilos.espacio}>
        <Campo etiqueta="Notas (opcional)" value={notas} onChangeText={setNotas} />
      </View>
      <Boton
        titulo={`Registrar pago ${formatearCLP(montoFinal)}`}
        onPress={registrarPago}
        cargando={trabajando}
      />

      <Text style={[estilos.subtitulo, estilos.espacio]}>Otras acciones</Text>
      <View style={estilos.acciones}>
        <Text
          accessibilityRole="button"
          style={estilos.enlace}
          onPress={() => actualizar({ p_dias_prueba: 7 }, 'Prueba extendida 7 días.')}
        >
          Extender prueba 7 días
        </Text>
        {negocio.suspendida ? (
          <Text
            accessibilityRole="button"
            style={estilos.enlace}
            onPress={() => actualizar({ p_suspendida: false }, 'Suspensión levantada.')}
          >
            Quitar suspensión
          </Text>
        ) : (
          <Text
            accessibilityRole="button"
            style={[estilos.enlace, estilos.peligro]}
            onPress={() => actualizar({ p_suspendida: true }, 'Negocio suspendido (solo lectura).')}
          >
            Suspender
          </Text>
        )}
      </View>
    </Hoja>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resumen: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cifra: { alignItems: 'center', flex: 1 },
  numero: { fontSize: 26, fontWeight: '700' },
  buscador: {
    minHeight: 46,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colores.borde,
    fontSize: 16,
    color: colores.texto,
    backgroundColor: colores.superficie,
  },
  tarjeta: {
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  nombre: { fontSize: 16, fontWeight: '600', color: colores.texto },
  estado: { fontSize: 13, fontWeight: '700' },
  nota: { marginTop: 2, fontSize: 13, color: colores.textoSecundario },
  subtitulo: { marginBottom: 8, fontSize: 15, fontWeight: '700', color: colores.texto },
  espacio: { marginTop: 12 },
  acciones: { gap: 12 },
  enlace: { fontSize: 15, color: colores.primario },
  peligro: { color: colores.error },
});
