import Constants from 'expo-constants';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { formatearCLP, formatearFechaHora } from '@/lib/formato';
import { colores } from '@/theme/colores';

export default function MasScreen() {
  const db = useSQLiteContext();
  const [versionBase, setVersionBase] = useState<number | null>(null);

  useEffect(() => {
    db.getFirstAsync<{ user_version: number }>('PRAGMA user_version').then((fila) =>
      setVersionBase(fila?.user_version ?? 0),
    );
  }, [db]);

  const filas: [string, string][] = [
    ['Versión de la app', Constants.expoConfig?.version ?? '-'],
    ['Versión de la base de datos', versionBase === null ? '...' : String(versionBase)],
    ['Fecha y hora', formatearFechaHora(new Date())],
    ['Ejemplo de monto', formatearCLP(1234567)],
  ];

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.seccion}>Acerca de</Text>
      <View style={estilos.tarjeta}>
        {filas.map(([etiqueta, valor], i) => (
          <View key={etiqueta} style={[estilos.fila, i > 0 && estilos.separador]}>
            <Text style={estilos.etiqueta}>{etiqueta}</Text>
            <Text style={estilos.valor}>{valor}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, padding: 16, backgroundColor: colores.fondo },
  seccion: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
  tarjeta: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  fila: { flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  separador: { borderTopWidth: 1, borderTopColor: colores.borde },
  etiqueta: { fontSize: 15, color: colores.texto },
  valor: { fontSize: 15, color: colores.textoSecundario },
});
