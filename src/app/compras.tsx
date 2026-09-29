import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Formulario } from '@/components/Formulario';
import { listarCompras, type ResumenCompra } from '@/db/compras';
import { formatearCLP, formatearFechaHora } from '@/lib/formato';
import { formatearCantidad } from '@/lib/numeros';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

export default function ComprasScreen() {
  const db = useSQLiteContext();
  const { negocioId, versionDatos } = useSesion();
  const [compras, setCompras] = useState<ResumenCompra[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    if (negocioId) listarCompras(db, negocioId).then(setCompras);
  }, [db, negocioId, versionDatos]);

  return (
    <Formulario titulo="Ingresos anteriores">
      {compras.length === 0 ? (
        <Text style={estilos.nota}>Aún no hay ingresos de mercadería.</Text>
      ) : null}
      {compras.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => setAbierta(abierta === c.id ? null : c.id)}
          style={estilos.tarjeta}
        >
          <View style={estilos.fila}>
            <View style={estilos.flex}>
              <Text style={estilos.titulo}>{c.proveedor ?? 'Sin proveedor'}</Text>
              <Text style={estilos.nota}>
                {formatearFechaHora(new Date(c.creadoEn))}
                {c.documento ? ` · ${c.documento}` : ''} · {c.items.length} producto(s)
              </Text>
            </View>
            <Text style={estilos.total}>{formatearCLP(c.total)}</Text>
          </View>
          {abierta === c.id
            ? c.items.map((i, n) => (
                <View key={n} style={[estilos.fila, estilos.item]}>
                  <Text style={[estilos.flex, estilos.nota]}>
                    {formatearCantidad(i.cantidad)} × {i.nombre} a {formatearCLP(i.costoUnitario)}
                  </Text>
                  <Text style={estilos.nota}>{formatearCLP(i.total)}</Text>
                </View>
              ))
            : null}
        </Pressable>
      ))}
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  tarjeta: {
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: { marginTop: 6 },
  titulo: { fontSize: 16, fontWeight: '600', color: colores.texto },
  total: { fontSize: 16, fontWeight: '700', color: colores.texto },
  nota: { fontSize: 13, color: colores.textoSecundario },
});
