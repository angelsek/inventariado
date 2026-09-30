import { StyleSheet, Text, View } from 'react-native';

import { formatearCLP } from '@/lib/formato';
import { colores } from '@/theme/colores';

export type FilaBarra = { clave: string; etiqueta: string; monto: number; detalle?: string };

type Props = {
  filas: FilaBarra[];
  /** Resalta la fila con el mayor monto. */
  destacarMayor?: boolean;
};

/** Lista de barras horizontales proporcionales al monto (gráfico simple). */
export function Barras({ filas, destacarMayor }: Props) {
  const maximo = Math.max(0, ...filas.map((f) => f.monto));
  return (
    <View style={estilos.lista}>
      {filas.map((f) => {
        const mayor = destacarMayor && maximo > 0 && f.monto === maximo;
        return (
          <View key={f.clave} style={estilos.fila}>
            <View style={estilos.textos}>
              <Text style={[estilos.etiqueta, mayor && estilos.mayor]} numberOfLines={1}>
                {f.etiqueta}
              </Text>
              <Text style={[estilos.monto, mayor && estilos.mayor]}>{formatearCLP(f.monto)}</Text>
            </View>
            <View style={estilos.pista}>
              <View
                style={[
                  estilos.barra,
                  mayor && estilos.barraMayor,
                  { width: `${maximo > 0 ? Math.max(1, (f.monto / maximo) * 100) : 0}%` },
                ]}
              />
            </View>
            {f.detalle ? <Text style={estilos.detalle}>{f.detalle}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  lista: { gap: 10 },
  fila: { gap: 4 },
  textos: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  etiqueta: { flex: 1, fontSize: 14, color: colores.texto },
  monto: { fontSize: 14, fontWeight: '600', color: colores.texto },
  mayor: { color: colores.primario, fontWeight: '700' },
  pista: { height: 8, borderRadius: 4, backgroundColor: colores.fondo, overflow: 'hidden' },
  barra: { height: 8, borderRadius: 4, backgroundColor: '#90B4E0' },
  barraMayor: { backgroundColor: colores.primario },
  detalle: { fontSize: 12, color: colores.textoSecundario },
});
