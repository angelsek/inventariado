import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Hoja } from '@/components/Hoja';
import { type Cliente, crearCliente, listarClientes, obtenerCliente } from '@/db/clientes';
import { formatearCLP } from '@/lib/formato';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

type Props = {
  visible: boolean;
  onElegir: (cliente: Cliente) => void;
  onCerrar: () => void;
};

/** Buscar un cliente para fiarle, o crearlo en el momento. */
export function ElegirCliente({ visible, onElegir, onCerrar }: Props) {
  const db = useSQLiteContext();
  const negocioId = useSesion((s) => s.negocioId);
  const [busqueda, setBusqueda] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [creando, setCreando] = useState(false);
  const [telefono, setTelefono] = useState('');

  useEffect(() => {
    if (visible && negocioId) listarClientes(db, negocioId, { busqueda }).then(setClientes);
  }, [db, negocioId, busqueda, visible]);

  const crear = async () => {
    if (!busqueda.trim()) return;
    const id = await crearCliente(db, negocioId!, {
      nombre: busqueda,
      telefono,
      limiteCredito: 0,
    });
    const cliente = await obtenerCliente(db, id);
    setBusqueda('');
    setTelefono('');
    setCreando(false);
    if (cliente) onElegir(cliente);
  };

  return (
    <Hoja visible={visible} titulo="¿A quién se le fía?" onCerrar={onCerrar}>
      <Campo
        etiqueta={creando ? 'Nombre del cliente nuevo' : 'Buscar cliente'}
        placeholder="Nombre"
        value={busqueda}
        onChangeText={setBusqueda}
      />
      {creando ? (
        <>
          <Campo
            etiqueta="Teléfono (opcional)"
            keyboardType="phone-pad"
            placeholder="+56 9 1234 5678"
            value={telefono}
            onChangeText={setTelefono}
          />
          <View style={estilos.botones}>
            <Boton titulo="Crear y fiar" deshabilitado={!busqueda.trim()} onPress={crear} />
            <Boton titulo="Cancelar" variante="secundario" onPress={() => setCreando(false)} />
          </View>
        </>
      ) : (
        <>
          <ScrollView style={estilos.lista} keyboardShouldPersistTaps="handled">
            {clientes.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => onElegir(c)}
                style={estilos.fila}
              >
                <Text style={estilos.nombre}>{c.nombre}</Text>
                <Text style={[estilos.saldo, c.saldo > 0 && estilos.debe]}>
                  {c.saldo > 0 ? `Debe ${formatearCLP(c.saldo)}` : 'Sin deuda'}
                </Text>
              </Pressable>
            ))}
            {clientes.length === 0 ? (
              <Text style={estilos.vacio}>
                {busqueda.trim() ? 'No hay clientes con ese nombre.' : 'Todavía no hay clientes.'}
              </Text>
            ) : null}
          </ScrollView>
          <Boton titulo="+ Cliente nuevo" variante="secundario" onPress={() => setCreando(true)} />
        </>
      )}
    </Hoja>
  );
}

const estilos = StyleSheet.create({
  lista: { maxHeight: 280, marginBottom: 12 },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.borde,
  },
  nombre: { flex: 1, fontSize: 16, color: colores.texto },
  saldo: { fontSize: 14, color: colores.textoSecundario },
  debe: { color: colores.aviso, fontWeight: '600' },
  vacio: { paddingVertical: 12, fontSize: 14, color: colores.textoSecundario },
  botones: { gap: 8 },
});
