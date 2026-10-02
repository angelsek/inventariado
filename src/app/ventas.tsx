import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { listarVentas, type ResumenVenta, resumirVentas } from '@/db/ventas';
import { etiquetaMedio, type MedioPago, MEDIOS_PAGO } from '@/features/ventas/calculos';
import { codigoVenta } from '@/features/ventas/comprobante';
import { esHoy, formatearHora, rangoDelDia, sumarDias } from '@/lib/fechas';
import { formatearCLP, formatearFecha } from '@/lib/formato';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

type Resumen = Awaited<ReturnType<typeof resumirVentas>>;

export default function VentasScreen() {
  const db = useSQLiteContext();
  const { negocioId, versionDatos } = useSesion();
  const [dia, setDia] = useState(() => new Date());
  const [ventas, setVentas] = useState<ResumenVenta[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => {
    if (!negocioId) return;
    const { desde, hasta } = rangoDelDia(dia);
    listarVentas(db, negocioId, desde, hasta).then(setVentas);
    resumirVentas(db, negocioId, desde, hasta).then(setResumen);
  }, [db, negocioId, dia, versionDatos]);

  return (
    <View style={estilos.pantalla}>
      <View style={estilos.dias}>
        <Pressable accessibilityLabel="Día anterior" onPress={() => setDia(sumarDias(dia, -1))}>
          <Ionicons name="chevron-back" size={28} color={colores.primario} />
        </Pressable>
        <Text style={estilos.dia}>{esHoy(dia) ? 'Hoy' : formatearFecha(dia)}</Text>
        <Pressable
          accessibilityLabel="Día siguiente"
          disabled={esHoy(dia)}
          onPress={() => setDia(sumarDias(dia, 1))}
        >
          <Ionicons
            name="chevron-forward"
            size={28}
            color={esHoy(dia) ? colores.borde : colores.primario}
          />
        </Pressable>
      </View>

      {resumen ? (
        <View style={estilos.resumen}>
          <Text style={estilos.total}>{formatearCLP(resumen.total)}</Text>
          <Text style={estilos.nota}>{resumen.cantidad} venta(s)</Text>
          <View style={estilos.medios}>
            {MEDIOS_PAGO.filter((m) => resumen.porMedio[m.valor] > 0).map((m) => (
              <Text key={m.valor} style={estilos.medio}>
                {m.etiqueta}: {formatearCLP(resumen.porMedio[m.valor])}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <FlatList
        data={ventas}
        keyExtractor={(v) => v.id}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={<Text style={estilos.vacio}>No hay ventas este día.</Text>}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/venta/${item.id}`)}
            style={({ pressed }) => [estilos.fila, pressed && estilos.presionada]}
          >
            <View style={estilos.flex}>
              <Text style={estilos.hora}>
                {formatearHora(new Date(item.creadoEn))} · N° {codigoVenta(item.id)}
              </Text>
              <Text style={estilos.nota}>
                {item.cantidadItems} producto(s) ·{' '}
                {item.medios.map((m) => etiquetaMedio(m as MedioPago)).join(', ')}
                {item.vendedor ? ` · ${item.vendedor}` : ''}
              </Text>
            </View>
            <View style={estilos.derecha}>
              <Text style={[estilos.monto, item.estado === 'anulada' && estilos.anulada]}>
                {formatearCLP(item.total)}
              </Text>
              {item.estado === 'anulada' ? (
                <Text style={estilos.etiquetaAnulada}>Anulada</Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  flex: { flex: 1 },
  dias: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dia: { fontSize: 18, fontWeight: '600', color: colores.texto },
  resumen: {
    marginHorizontal: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    alignItems: 'center',
  },
  total: { fontSize: 30, fontWeight: '700', color: colores.texto },
  medios: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  medio: { fontSize: 14, color: colores.textoSecundario },
  lista: { padding: 12 },
  vacio: { marginTop: 32, textAlign: 'center', fontSize: 16, color: colores.textoSecundario },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  presionada: { opacity: 0.6 },
  hora: { fontSize: 16, fontWeight: '600', color: colores.texto },
  nota: { marginTop: 2, fontSize: 13, color: colores.textoSecundario },
  derecha: { alignItems: 'flex-end' },
  monto: { fontSize: 17, fontWeight: '700', color: colores.texto },
  anulada: { color: colores.inactivo, textDecorationLine: 'line-through' },
  etiquetaAnulada: { fontSize: 12, color: colores.error },
});
