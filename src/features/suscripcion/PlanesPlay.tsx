import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { formatearFecha } from '@/lib/formato';
import { mensajeDeError } from '@/lib/supabase';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores, radios } from '@/theme/colores';

import { NOMBRE_PLAN } from './estado';
import {
  comprarPlan,
  escucharCompras,
  obtenerPlanesPlay,
  type PlanPlay,
  revisarComprasPendientes,
} from './googlePlay';

const BENEFICIOS: Record<string, string> = {
  basico: 'Hasta 2 teléfonos',
  pro: 'Hasta 5 teléfonos',
};

const enDias = (dias: number) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return formatearFecha(fecha);
};

/**
 * Planes a la venta en Google Play, con el botón para suscribirse (prueba gratis
 * incluida). Solo el dueño puede comprar.
 */
export function PlanesPlay() {
  const db = useSQLiteContext();
  const { negocioId, perfil, suscripcion } = useSesion();
  const esDueno = perfil?.rol === 'dueno';
  const [planes, setPlanes] = useState<PlanPlay[] | null>(null);
  const [comprando, setComprando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      // Si una compra anterior quedó a medias, se termina de activar primero.
      if (negocioId && esDueno && (await revisarComprasPendientes(negocioId)) > 0) {
        await sincronizarAhora(db);
      }
      return { planes: await obtenerPlanesPlay(), error: null };
    } catch (e) {
      return {
        planes: [],
        error: `No se pudo conectar con Google Play. Revisa tu conexión. ${mensajeDeError(e)}`,
      };
    }
  }, [db, negocioId, esDueno]);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof cargar>>) => {
    setPlanes(r.planes);
    setError(r.error);
  }, []);

  useEffect(() => {
    cargar().then(aplicar);
  }, [cargar, aplicar]);

  useEffect(() => {
    if (!negocioId) return;
    return escucharCompras(negocioId, (resultado) => {
      setComprando(null);
      if (resultado.ok) {
        setListo(true);
        sincronizarAhora(db);
      } else if (resultado.error) {
        setError(resultado.error);
      }
    });
  }, [db, negocioId]);

  if (!esDueno) {
    return (
      <View style={estilos.tarjeta}>
        <Text style={estilos.nota}>
          Pídele al dueño del negocio que active un plan desde su teléfono (Más → Suscripción).
        </Text>
      </View>
    );
  }

  if (listo) {
    return (
      <View style={[estilos.tarjeta, estilos.exito]}>
        <Text style={estilos.titulo}>¡Listo! Tu plan quedó activo.</Text>
        <Text style={estilos.nota}>Todos los teléfonos del negocio se activan al sincronizar.</Text>
      </View>
    );
  }

  if (planes === null) return <ActivityIndicator color={colores.primario} />;

  return (
    <View style={estilos.lista}>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {planes.map((p) => {
        const actual = suscripcion?.estado === 'activa' && suscripcion.planId === p.plan;
        return (
          <View key={p.plan} style={[estilos.tarjeta, actual && estilos.actual]}>
            <View style={estilos.fila}>
              <Text style={estilos.titulo}>{NOMBRE_PLAN[p.plan]}</Text>
              <Text style={estilos.precio}>{p.precio}/mes</Text>
            </View>
            <Text style={estilos.nota}>{BENEFICIOS[p.plan]}</Text>
            {actual ? (
              <Text style={estilos.actualTexto}>Tu plan actual</Text>
            ) : (
              <>
                <View style={estilos.espacio} />
                <Boton
                  titulo={p.diasPrueba ? `Probar ${p.diasPrueba} días gratis` : 'Suscribirme'}
                  cargando={comprando === p.plan}
                  deshabilitado={comprando !== null}
                  onPress={() => {
                    setError(null);
                    setComprando(p.plan);
                    comprarPlan(p, negocioId!).catch((e) => {
                      setComprando(null);
                      setError(mensajeDeError(e));
                    });
                  }}
                />
                <Text style={estilos.letraChica}>
                  {p.diasPrueba
                    ? `No se te cobra nada hasta el ${enDias(p.diasPrueba)}. Después, ${p.precio} al mes con la tarjeta de tu cuenta de Google.`
                    : `${p.precio} al mes con la tarjeta de tu cuenta de Google.`}{' '}
                  Cancela cuando quieras en Play Store.
                </Text>
              </>
            )}
          </View>
        );
      })}
      {planes.length === 0 && !error ? (
        <Text style={estilos.nota}>Los planes todavía no están disponibles en Google Play.</Text>
      ) : null}
      {error ? (
        <Boton titulo="Reintentar" variante="secundario" onPress={() => cargar().then(aplicar)} />
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  lista: { gap: 12 },
  tarjeta: {
    padding: 18,
    borderRadius: radios.medio,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  actual: { borderColor: colores.primario, borderWidth: 2 },
  exito: { backgroundColor: colores.fondoExito, borderColor: colores.exito },
  fila: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  titulo: { fontSize: 20, fontWeight: '700', color: colores.texto },
  precio: { fontSize: 20, fontWeight: '700', color: colores.primario },
  nota: { marginTop: 4, fontSize: 16, color: colores.textoSecundario },
  actualTexto: { marginTop: 10, fontSize: 15, fontWeight: '700', color: colores.primario },
  espacio: { height: 14 },
  letraChica: { marginTop: 10, fontSize: 13, lineHeight: 18, color: colores.textoSecundario },
  error: { fontSize: 15, color: colores.error },
});
