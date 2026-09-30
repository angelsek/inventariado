import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { type Cliente, listarClientes } from '@/db/clientes';
import { formatearCLP, formatearFecha } from '@/lib/formato';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

/** Clientes con fiado: quién debe y cuánto. */
export default function ClientesScreen() {
  const db = useSQLiteContext();
  const { negocioId, versionDatos } = useSesion();
  const [busqueda, setBusqueda] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);

  useEffect(() => {
    if (negocioId) listarClientes(db, negocioId, { busqueda }).then(setClientes);
  }, [db, negocioId, busqueda, versionDatos]);

  const deudaTotal = clientes.reduce((s, c) => s + Math.max(0, c.saldo), 0);

  return (
    <View style={estilos.pantalla}>
      <View style={estilos.cabecera}>
        <Text style={estilos.etiqueta}>Por cobrar</Text>
        <Text style={estilos.total}>{formatearCLP(deudaTotal)}</Text>
        <View style={estilos.buscador}>
          <Ionicons name="search" size={20} color={colores.inactivo} />
          <TextInput
            accessibilityLabel="Buscar cliente"
            placeholder="Buscar cliente"
            placeholderTextColor={colores.inactivo}
            value={busqueda}
            onChangeText={setBusqueda}
            style={estilos.entrada}
          />
        </View>
      </View>
      <FlatList
        data={clientes}
        keyExtractor={(c) => c.id}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            Todavía no hay clientes. Se agregan aquí o al cobrar con Fiado.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/cliente/[id]', params: { id: item.id } })}
            style={estilos.fila}
          >
            <View style={estilos.flex}>
              <Text style={estilos.nombre}>{item.nombre}</Text>
              <Text style={estilos.nota}>
                {item.ultimoMovimiento
                  ? `Último movimiento: ${formatearFecha(new Date(item.ultimoMovimiento))}`
                  : 'Sin movimientos'}
                {item.limiteCredito > 0 ? ` · Límite ${formatearCLP(item.limiteCredito)}` : ''}
              </Text>
            </View>
            <Text style={[estilos.saldo, item.saldo > 0 && estilos.debe]}>
              {formatearCLP(item.saldo)}
            </Text>
          </Pressable>
        )}
      />
      <View style={estilos.pie}>
        <Boton
          titulo="+ Cliente nuevo"
          onPress={() => router.push({ pathname: '/cliente/[id]', params: { id: 'nuevo' } })}
        />
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  cabecera: {
    padding: 16,
    backgroundColor: colores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  etiqueta: { fontSize: 13, color: colores.textoSecundario },
  total: { fontSize: 28, fontWeight: '700', color: colores.texto, marginBottom: 12 },
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.fondo,
  },
  entrada: { flex: 1, minHeight: 44, fontSize: 16, color: colores.texto },
  lista: { padding: 16, gap: 8 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  flex: { flex: 1 },
  nombre: { fontSize: 16, fontWeight: '600', color: colores.texto },
  nota: { marginTop: 2, fontSize: 12, color: colores.textoSecundario },
  saldo: { fontSize: 16, fontWeight: '700', color: colores.exito },
  debe: { color: colores.aviso },
  vacio: { marginTop: 32, textAlign: 'center', fontSize: 15, color: colores.textoSecundario },
  pie: { padding: 16, borderTopWidth: 1, borderTopColor: colores.borde },
});
