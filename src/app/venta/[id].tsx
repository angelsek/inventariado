import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { Hoja } from '@/components/Hoja';
import { obtenerNegocio } from '@/db/negocio';
import { anularVenta, type DetalleVenta, obtenerVenta } from '@/db/ventas';
import { etiquetaMedio } from '@/features/ventas/calculos';
import { codigoVenta, textoComprobante } from '@/features/ventas/comprobante';
import { formatearCLP, formatearFechaHora } from '@/lib/formato';
import { formatearCantidad } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

export default function VentaScreen() {
  const { id, recien } = useLocalSearchParams<{ id: string; recien?: string }>();
  const db = useSQLiteContext();
  const { negocioId, perfil, versionDatos, datosCambiaron } = useSesion();
  const [venta, setVenta] = useState<DetalleVenta | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    obtenerVenta(db, id).then(setVenta);
  }, [db, id, versionDatos]);

  if (!venta) {
    return (
      <Formulario titulo="Venta">
        <Text style={estilos.nota}>Cargando...</Text>
      </Formulario>
    );
  }

  const compartir = async () => {
    const negocio = negocioId ? await obtenerNegocio(db, negocioId) : null;
    await Share.share({ message: textoComprobante(negocio?.nombre ?? '', venta) });
  };

  const confirmarAnulacion = async () => {
    await anularVenta(db, venta.id, motivo, await obtenerAutor(db));
    setAnulando(false);
    setMotivo('');
    datosCambiaron();
    sincronizarAhora(db);
  };

  const esRecien = recien === '1';
  const anulada = venta.estado === 'anulada';

  return (
    <Formulario titulo={esRecien ? 'Venta registrada' : `Venta N° ${codigoVenta(venta.id)}`}>
      {esRecien ? (
        <View style={estilos.exito}>
          <Ionicons name="checkmark-circle" size={48} color={colores.exito} />
          <Text style={estilos.totalGrande}>{formatearCLP(venta.total)}</Text>
          {venta.vuelto ? (
            <Text style={estilos.vuelto}>Vuelto: {formatearCLP(venta.vuelto)}</Text>
          ) : null}
        </View>
      ) : null}

      {anulada ? (
        <View style={estilos.anulada}>
          <Text style={estilos.textoAnulada}>Venta anulada</Text>
          <Text style={estilos.nota}>
            {venta.anuladaEn ? formatearFechaHora(new Date(venta.anuladaEn)) : ''}
            {venta.anuladaPor ? ` · por ${venta.anuladaPor}` : ''}
          </Text>
          {venta.motivoAnulacion ? (
            <Text style={estilos.nota}>Motivo: {venta.motivoAnulacion}</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={estilos.nota}>
        {formatearFechaHora(new Date(venta.creadoEn))}
        {venta.vendedor ? ` · Atendió: ${venta.vendedor}` : ''}
      </Text>

      <View style={estilos.tarjeta}>
        {venta.items.map((item) => (
          <View key={item.id} style={estilos.item}>
            <View style={estilos.flex}>
              <Text style={estilos.nombre}>{item.nombre}</Text>
              <Text style={estilos.nota}>
                {formatearCantidad(item.cantidad)} × {formatearCLP(item.precioUnitario)}
                {item.descuento ? ` · desc. ${formatearCLP(item.descuento)}` : ''}
              </Text>
            </View>
            <Text style={estilos.monto}>{formatearCLP(item.total)}</Text>
          </View>
        ))}
        {venta.descuento > 0 ? (
          <View style={estilos.item}>
            <Text style={[estilos.flex, estilos.nota]}>Descuento</Text>
            <Text style={estilos.monto}>-{formatearCLP(venta.descuento)}</Text>
          </View>
        ) : null}
        <View style={[estilos.item, estilos.totalFila]}>
          <Text style={[estilos.flex, estilos.nombre]}>Total</Text>
          <Text style={[estilos.monto, anulada && estilos.tachado]}>
            {formatearCLP(venta.total)}
          </Text>
        </View>
      </View>

      <View style={estilos.tarjeta}>
        {venta.pagos.map((pago, i) => (
          <View key={i} style={estilos.item}>
            <Text style={estilos.flex}>{etiquetaMedio(pago.medio)}</Text>
            <Text style={estilos.monto}>{formatearCLP(pago.monto)}</Text>
          </View>
        ))}
        {venta.efectivoRecibido !== null ? (
          <View style={estilos.item}>
            <Text style={[estilos.flex, estilos.nota]}>
              Recibido {formatearCLP(venta.efectivoRecibido)}
            </Text>
            <Text style={estilos.nota}>Vuelto {formatearCLP(venta.vuelto ?? 0)}</Text>
          </View>
        ) : null}
      </View>

      <View style={estilos.botones}>
        {esRecien ? <Boton titulo="Nueva venta" onPress={() => router.back()} /> : null}
        <Boton titulo="Compartir comprobante" variante="secundario" onPress={compartir} />
        {!anulada && perfil?.rol === 'dueno' ? (
          <Boton titulo="Anular venta" variante="peligro" onPress={() => setAnulando(true)} />
        ) : null}
      </View>

      <Hoja visible={anulando} titulo="Anular venta" onCerrar={() => setAnulando(false)}>
        <Text style={[estilos.nota, estilos.espacio]}>
          Los productos vuelven al stock y la venta deja de contar en los totales. No se puede
          deshacer.
        </Text>
        <Campo etiqueta="Motivo (opcional)" value={motivo} onChangeText={setMotivo} />
        <Boton titulo="Confirmar anulación" variante="peligro" onPress={confirmarAnulacion} />
      </Hoja>
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  exito: { alignItems: 'center', marginBottom: 16 },
  totalGrande: { fontSize: 34, fontWeight: '700', color: colores.texto },
  vuelto: { marginTop: 4, fontSize: 24, fontWeight: '600', color: colores.exito },
  anulada: { padding: 12, marginBottom: 12, borderRadius: 10, backgroundColor: colores.fondoError },
  textoAnulada: { fontSize: 16, fontWeight: '700', color: colores.error },
  nota: { fontSize: 14, color: colores.textoSecundario },
  tarjeta: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  item: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  totalFila: { borderTopWidth: 1, borderTopColor: colores.borde },
  nombre: { fontSize: 16, fontWeight: '600', color: colores.texto },
  monto: { fontSize: 16, fontWeight: '600', color: colores.texto },
  tachado: { textDecorationLine: 'line-through', color: colores.inactivo },
  botones: { marginTop: 20, gap: 10 },
  espacio: { marginBottom: 16 },
});
