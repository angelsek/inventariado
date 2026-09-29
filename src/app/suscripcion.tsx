import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import { CANAL, CONTACTO } from '@/config';
import { AJUSTE_DISPOSITIVO, leerAjuste } from '@/db/ajustes';
import { obtenerNegocio } from '@/db/negocio';
import { type Estado, NOMBRE_PLAN } from '@/features/suscripcion/estado';
import { formatearCLP, formatearFecha, formatearFechaHora } from '@/lib/formato';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

type Plan = {
  id: string;
  nombre: string;
  precio_mensual: number;
  max_dispositivos: number;
  reportes_avanzados: boolean;
};
type Dispositivo = { id: string; nombre: string; ultimo_sync: string | null };
type Pago = { id: string; plan_id: string; meses: number; monto: number; creado_en: string };

const ETIQUETA_ESTADO: Record<Estado, { texto: string; color: string }> = {
  prueba: { texto: 'Prueba gratis', color: colores.primario },
  activa: { texto: 'Activa', color: colores.exito },
  vencida: { texto: 'Vencida (período de gracia)', color: colores.aviso },
  suspendida: { texto: 'Suspendida (solo lectura)', color: colores.error },
};

export default function SuscripcionScreen() {
  const db = useSQLiteContext();
  const { negocioId, perfil, suscripcion } = useSesion();
  const esDueno = perfil?.rol === 'dueno';
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [telefonos, setTelefonos] = useState<{
    limite: number;
    dispositivos: Dispositivo[];
  } | null>(null);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [miDispositivo, setMiDispositivo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const obtener = useCallback(async () => {
    if (!negocioId) return null;
    const mi = await leerAjuste(db, AJUSTE_DISPOSITIVO);
    try {
      const [p, t, g] = await Promise.all([
        supabase.from('planes').select('*').order('orden'),
        supabase.rpc('mis_dispositivos', { p_negocio_id: negocioId }),
        supabase
          .from('pagos_suscripcion')
          .select('id, plan_id, meses, monto, creado_en')
          .order('creado_en', { ascending: false })
          .limit(12),
      ]);
      const fallo = p.error ?? t.error ?? g.error;
      if (fallo) throw new Error(fallo.message);
      return {
        mi,
        planes: p.data as Plan[],
        telefonos: t.data as { limite: number; dispositivos: Dispositivo[] },
        pagos: g.data as Pago[],
        error: null,
      };
    } catch (e) {
      return {
        mi,
        planes: [],
        telefonos: null,
        pagos: [],
        error: `No se pudieron cargar los planes y teléfonos. ${mensajeDeError(e)}`,
      };
    }
  }, [db, negocioId]);

  const aplicar = useCallback((datos: Awaited<ReturnType<typeof obtener>>) => {
    if (!datos) return;
    setMiDispositivo(datos.mi);
    setPlanes(datos.planes);
    setTelefonos(datos.telefonos);
    setPagos(datos.pagos);
    setError(datos.error);
  }, []);

  const cargar = useCallback(() => obtener().then(aplicar), [obtener, aplicar]);

  useEffect(() => {
    obtener().then(aplicar);
  }, [obtener, aplicar]);

  const desvincular = (d: Dispositivo) =>
    Alert.alert(
      'Desvincular teléfono',
      `"${d.nombre}" cerrará sesión la próxima vez que sincronice y liberará un cupo del plan. Los cambios que no haya subido se perderán.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desvincular',
          style: 'destructive',
          onPress: async () => {
            const { error: e } = await supabase.rpc('desvincular_dispositivo', { p_id: d.id });
            if (e) Alert.alert('Error', mensajeDeError(e));
            cargar();
          },
        },
      ],
    );

  const avisarPago = async () => {
    const negocio = negocioId ? await obtenerNegocio(db, negocioId) : null;
    const texto = encodeURIComponent(
      `Hola, quiero pagar la suscripción de Inventariado para "${negocio?.nombre ?? ''}".`,
    );
    const numero = CONTACTO.whatsapp.replace(/\D/g, '');
    Linking.openURL(
      numero ? `https://wa.me/${numero}?text=${texto}` : `mailto:${CONTACTO.correo}?body=${texto}`,
    );
  };

  const estado = suscripcion ? ETIQUETA_ESTADO[suscripcion.estado] : null;

  return (
    <Formulario titulo="Suscripción" error={error}>
      {suscripcion ? (
        <View style={estilos.tarjeta}>
          <Text style={[estilos.estado, { color: estado!.color }]}>{estado!.texto}</Text>
          <Text style={estilos.plan}>
            Plan {NOMBRE_PLAN[suscripcion.planId] ?? suscripcion.planId}
          </Text>
          {suscripcion.venceEn ? (
            <Text style={estilos.nota}>
              {suscripcion.estado === 'prueba' ? 'La prueba termina' : 'Pagado hasta'} el{' '}
              {formatearFecha(suscripcion.venceEn)}
              {suscripcion.diasRestantes !== null && suscripcion.diasRestantes >= 0
                ? ` (${suscripcion.diasRestantes} días)`
                : ''}
            </Text>
          ) : null}
          {suscripcion.estado === 'vencida' ? (
            <Text style={estilos.aviso}>
              Quedan {suscripcion.diasGracia} día(s) antes de pasar a solo lectura.
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={estilos.nota}>Sincroniza para ver el estado de la suscripción.</Text>
      )}

      {/*
        En la versión de Google Play no se muestran precios ni formas de pago externas
        (política de pagos de Play): la suscripción se gestiona fuera de la app.
      */}
      {CANAL === 'play' ? (
        <View style={estilos.tarjeta}>
          <Text style={estilos.nota}>
            La suscripción de tu negocio se gestiona directamente con Inventariado, fuera de esta
            app.
          </Text>
        </View>
      ) : null}

      {CANAL !== 'play' && planes.length ? (
        <>
          <Text style={estilos.seccion}>Planes</Text>
          {planes.map((p) => (
            <View
              key={p.id}
              style={[estilos.tarjeta, suscripcion?.planId === p.id && estilos.actual]}
            >
              <View style={estilos.fila}>
                <Text style={[estilos.plan, estilos.flex]}>{p.nombre}</Text>
                <Text style={estilos.precio}>{formatearCLP(p.precio_mensual)}/mes</Text>
              </View>
              <Text style={estilos.nota}>
                Hasta {p.max_dispositivos} teléfonos
                {p.reportes_avanzados ? ' · reportes avanzados' : ''}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {esDueno && CANAL !== 'play' ? (
        <View style={estilos.tarjeta}>
          <Text style={estilos.plan}>¿Cómo pagar?</Text>
          <Text style={estilos.nota}>
            {CONTACTO.datosTransferencia ||
              'Transfiere el valor del plan y avísanos. Activamos tu suscripción apenas recibamos el pago.'}
          </Text>
          {CONTACTO.whatsapp || CONTACTO.correo ? (
            <View style={estilos.boton}>
              <Boton titulo="Avisar que pagué" variante="secundario" onPress={avisarPago} />
            </View>
          ) : null}
        </View>
      ) : null}

      {telefonos ? (
        <>
          <Text style={estilos.seccion}>
            Teléfonos ({telefonos.dispositivos.length} de {telefonos.limite})
          </Text>
          {telefonos.dispositivos.map((d) => (
            <View key={d.id} style={[estilos.tarjeta, estilos.fila]}>
              <View style={estilos.flex}>
                <Text style={estilos.nombre}>
                  {d.nombre}
                  {d.id === miDispositivo ? ' (este teléfono)' : ''}
                </Text>
                <Text style={estilos.nota}>
                  {d.ultimo_sync
                    ? `Última conexión: ${formatearFechaHora(new Date(d.ultimo_sync))}`
                    : 'Sin conexiones'}
                </Text>
              </View>
              {esDueno && d.id !== miDispositivo ? (
                <Text
                  accessibilityRole="button"
                  style={estilos.peligro}
                  onPress={() => desvincular(d)}
                >
                  Desvincular
                </Text>
              ) : null}
            </View>
          ))}
        </>
      ) : null}

      {pagos.length ? (
        <>
          <Text style={estilos.seccion}>Pagos</Text>
          {pagos.map((g) => (
            <View key={g.id} style={[estilos.fila, estilos.pago]}>
              <Text style={[estilos.flex, estilos.nota]}>
                {formatearFecha(new Date(g.creado_en))} · {NOMBRE_PLAN[g.plan_id] ?? g.plan_id} ·{' '}
                {g.meses} mes(es)
              </Text>
              <Text style={estilos.nombre}>{formatearCLP(g.monto)}</Text>
            </View>
          ))}
        </>
      ) : null}

      <View style={estilos.boton}>
        <Boton
          titulo="Actualizar"
          variante="secundario"
          onPress={() => sincronizarAhora(db).then(cargar)}
        />
      </View>
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tarjeta: {
    padding: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  actual: { borderColor: colores.primario, borderWidth: 2 },
  estado: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase' },
  plan: { marginTop: 2, fontSize: 18, fontWeight: '700', color: colores.texto },
  precio: { fontSize: 16, fontWeight: '600', color: colores.texto },
  nombre: { fontSize: 15, fontWeight: '600', color: colores.texto },
  nota: { marginTop: 4, fontSize: 14, color: colores.textoSecundario },
  aviso: { marginTop: 8, fontSize: 14, color: colores.aviso },
  peligro: { fontSize: 14, color: colores.error },
  seccion: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
  pago: { paddingVertical: 8 },
  boton: { marginTop: 12 },
});
