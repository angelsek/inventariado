import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Hoja } from '@/components/Hoja';
import { Selector } from '@/components/Selector';
import { ajustarStock, MOTIVOS_AJUSTE, type Producto } from '@/db/productos';
import { formatearCantidad, parsearCantidad } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { colores } from '@/theme/colores';
import { bloqueadoPorSuscripcion } from '@/features/suscripcion/useSoloLectura';

type Props = {
  producto: Producto;
  visible: boolean;
  onCerrar: () => void;
  onListo: () => void;
};

/** Corregir el stock de un producto indicando cuánto hay realmente y por qué. */
export function AjusteStock({ producto, visible, onCerrar, onListo }: Props) {
  const db = useSQLiteContext();
  const [nuevo, setNuevo] = useState('');
  const [motivo, setMotivo] = useState(MOTIVOS_AJUSTE[0]);
  const [error, setError] = useState<string | null>(null);

  const cantidad = parsearCantidad(nuevo);
  const diferencia =
    cantidad === null ? null : Math.round((cantidad - producto.stock) * 1000) / 1000;
  const unidad = producto.unidad === 'kg' ? ' kg' : '';

  const guardar = async () => {
    if (bloqueadoPorSuscripcion()) return;
    if (cantidad === null || cantidad < 0) return setError('Ingresa cuánto hay (0 o más).');
    await ajustarStock(db, {
      negocioId: producto.negocioId,
      productoId: producto.id,
      nuevoStock: cantidad,
      tipo: 'ajuste',
      motivo,
      autor: await obtenerAutor(db),
    });
    setNuevo('');
    setError(null);
    onListo();
  };

  return (
    <Hoja visible={visible} titulo="Ajustar stock" onCerrar={onCerrar}>
      <Text style={estilos.nota}>
        Stock actual: {formatearCantidad(producto.stock)}
        {unidad}
      </Text>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      <Campo
        etiqueta="¿Cuánto hay realmente?"
        keyboardType="decimal-pad"
        value={nuevo}
        onChangeText={setNuevo}
        ayuda={
          diferencia
            ? `${diferencia > 0 ? 'Suma' : 'Resta'} ${formatearCantidad(Math.abs(diferencia))}${unidad}`
            : undefined
        }
      />
      <Text style={estilos.etiqueta}>Motivo</Text>
      <Selector
        opciones={MOTIVOS_AJUSTE.map((m) => ({ valor: m, etiqueta: m }))}
        valor={motivo}
        onCambio={setMotivo}
      />
      <Boton titulo="Guardar ajuste" onPress={guardar} deshabilitado={diferencia === 0} />
    </Hoja>
  );
}

const estilos = StyleSheet.create({
  nota: { marginBottom: 12, fontSize: 15, color: colores.textoSecundario },
  etiqueta: { marginBottom: 6, fontSize: 14, fontWeight: '500', color: colores.texto },
  error: { marginBottom: 12, color: colores.error },
});
