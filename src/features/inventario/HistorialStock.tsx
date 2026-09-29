import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { listarMovimientos, type MovimientoStock, type TipoMovimiento } from '@/db/productos';
import { formatearFechaHora } from '@/lib/formato';
import { formatearCantidad } from '@/lib/numeros';
import { colores } from '@/theme/colores';

const NOMBRES: Record<TipoMovimiento, string> = {
  inicial: 'Stock inicial',
  venta: 'Venta',
  compra: 'Ingreso',
  ajuste: 'Ajuste',
  anulacion: 'Venta anulada',
  conteo: 'Conteo',
};

/** Últimos movimientos de stock de un producto (quién, cuándo y por qué). */
export function HistorialStock({ productoId, version }: { productoId: string; version: number }) {
  const db = useSQLiteContext();
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([]);

  useEffect(() => {
    listarMovimientos(db, productoId).then(setMovimientos);
  }, [db, productoId, version]);

  if (movimientos.length === 0) return null;

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Historial de stock</Text>
      {movimientos.map((m) => (
        <View key={m.id} style={estilos.fila}>
          <View style={estilos.flex}>
            <Text style={estilos.tipo}>
              {NOMBRES[m.tipo]}
              {m.motivo && m.motivo !== 'Toma de inventario' ? ` · ${m.motivo}` : ''}
            </Text>
            <Text style={estilos.nota}>
              {formatearFechaHora(new Date(m.creadoEn))}
              {m.perfil ? ` · ${m.perfil}` : ''}
            </Text>
          </View>
          <Text style={[estilos.cantidad, m.cantidad < 0 ? estilos.resta : estilos.suma]}>
            {m.cantidad > 0 ? '+' : ''}
            {formatearCantidad(m.cantidad)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { marginTop: 24 },
  titulo: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.borde,
  },
  flex: { flex: 1 },
  tipo: { fontSize: 15, color: colores.texto },
  nota: { fontSize: 12, color: colores.textoSecundario },
  cantidad: { fontSize: 16, fontWeight: '600' },
  suma: { color: colores.exito },
  resta: { color: colores.error },
});
