import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { Selector } from '@/components/Selector';
import { registrarVenta } from '@/db/ventas';
import {
  calcularTotales,
  type MedioPago,
  MEDIOS_PAGO,
  montosRapidos,
  revisarPagos,
} from '@/features/ventas/calculos';
import { useCarrito } from '@/features/ventas/carrito';
import { formatearCLP } from '@/lib/formato';
import { parsearMonto } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

const soloDigitos = (v: string) => v.replace(/\D/g, '');

export default function CobrarScreen() {
  const db = useSQLiteContext();
  const { negocioId, datosCambiaron } = useSesion();
  const carrito = useCarrito();
  const [descuento, setDescuento] = useState(
    carrito.descuentoGeneral ? String(carrito.descuentoGeneral) : '',
  );
  const {
    subtotal,
    descuento: descuentoAplicado,
    total,
  } = calcularTotales(carrito.items, parsearMonto(descuento || '0') ?? 0);

  const [medio, setMedio] = useState<MedioPago>('efectivo');
  const [mixto, setMixto] = useState(false);
  const [medioSegundo, setMedioSegundo] = useState<MedioPago>('debito');
  const [montoSegundo, setMontoSegundo] = useState('');
  const [recibido, setRecibido] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Con pago mixto, el segundo medio cubre un monto y el primero el resto.
  const segundo = mixto ? Math.min(parsearMonto(montoSegundo || '0') ?? 0, total) : 0;
  const pagos = [
    { medio, monto: total - segundo },
    ...(mixto ? [{ medio: medioSegundo, monto: segundo }] : []),
  ];
  const usaEfectivo = pagos.some((p) => p.medio === 'efectivo' && p.monto > 0);
  const efectivoACubrir = pagos
    .filter((p) => p.medio === 'efectivo')
    .reduce((s, p) => s + p.monto, 0);
  const recibidoNumero = recibido ? parsearMonto(recibido) : null;
  const revision = revisarPagos(total, pagos, usaEfectivo ? recibidoNumero : null);

  if (carrito.items.length === 0) {
    return (
      <Formulario titulo="Cobrar">
        <Text style={estilos.nota}>No hay productos en la venta.</Text>
        <Boton titulo="Volver" onPress={() => router.back()} />
      </Formulario>
    );
  }

  const confirmar = async () => {
    if (!revision.ok) return setError(revision.error);
    setGuardando(true);
    setError(null);
    try {
      const ventaId = await registrarVenta(db, {
        negocioId: negocioId!,
        items: carrito.items,
        descuentoGeneral: descuentoAplicado,
        pagos: revision.pagos,
        efectivoRecibido: revision.efectivoRecibido,
        vuelto: revision.vuelto,
        autor: await obtenerAutor(db),
      });
      carrito.vaciar();
      datosCambiaron();
      sincronizarAhora(db);
      router.replace({ pathname: '/venta/[id]', params: { id: ventaId, recien: '1' } });
    } catch (e) {
      setError(String(e));
      setGuardando(false);
    }
  };

  return (
    <Formulario titulo={`Total ${formatearCLP(total)}`} error={error}>
      <View style={estilos.resumen}>
        <Fila
          etiqueta={`Subtotal (${carrito.items.length} producto(s))`}
          valor={formatearCLP(subtotal)}
        />
        {descuentoAplicado > 0 ? (
          <Fila etiqueta="Descuento" valor={`-${formatearCLP(descuentoAplicado)}`} />
        ) : null}
      </View>
      <Campo
        etiqueta="Descuento a toda la venta (opcional)"
        keyboardType="number-pad"
        placeholder="$0"
        value={descuento}
        onChangeText={(v) => setDescuento(soloDigitos(v))}
      />

      <Text style={estilos.etiqueta}>{mixto ? 'Primer medio de pago' : 'Medio de pago'}</Text>
      <Selector opciones={MEDIOS_PAGO} valor={medio} onCambio={setMedio} />

      {mixto ? (
        <View style={estilos.bloque}>
          <Text style={estilos.etiqueta}>Segundo medio de pago</Text>
          <Selector opciones={MEDIOS_PAGO} valor={medioSegundo} onCambio={setMedioSegundo} />
          <Campo
            etiqueta={`Monto con ${MEDIOS_PAGO.find((m) => m.valor === medioSegundo)?.etiqueta}`}
            keyboardType="number-pad"
            placeholder="$0"
            value={montoSegundo}
            onChangeText={(v) => setMontoSegundo(soloDigitos(v))}
            ayuda={`El resto (${formatearCLP(total - segundo)}) se paga con ${MEDIOS_PAGO.find((m) => m.valor === medio)?.etiqueta}.`}
          />
        </View>
      ) : null}
      <Text
        accessibilityRole="button"
        style={estilos.enlace}
        onPress={() => {
          setMixto(!mixto);
          setMontoSegundo('');
        }}
      >
        {mixto ? 'Pagar con un solo medio' : '+ Pago mixto (ej. parte débito y parte efectivo)'}
      </Text>

      {usaEfectivo ? (
        <View style={estilos.bloque}>
          <Campo
            etiqueta={`Efectivo recibido (a cubrir: ${formatearCLP(efectivoACubrir)})`}
            keyboardType="number-pad"
            placeholder={formatearCLP(efectivoACubrir)}
            value={recibido}
            onChangeText={(v) => setRecibido(soloDigitos(v))}
          />
          <View style={estilos.rapidos}>
            {montosRapidos(efectivoACubrir).map((monto) => (
              <Pressable
                key={monto}
                accessibilityRole="button"
                onPress={() => setRecibido(String(monto))}
                style={[estilos.chip, recibidoNumero === monto && estilos.chipActivo]}
              >
                <Text
                  style={[estilos.textoChip, recibidoNumero === monto && estilos.textoChipActivo]}
                >
                  {monto === efectivoACubrir ? 'Exacto' : formatearCLP(monto)}
                </Text>
              </Pressable>
            ))}
          </View>
          {revision.ok && revision.vuelto !== null ? (
            <View style={estilos.vuelto}>
              <Text style={estilos.textoVuelto}>Vuelto</Text>
              <Text style={estilos.montoVuelto}>{formatearCLP(revision.vuelto)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {!revision.ok && (recibido || mixto) ? (
        <Text style={estilos.falta}>{revision.error}</Text>
      ) : null}

      <View style={estilos.confirmar}>
        <Boton
          titulo={`Confirmar venta ${formatearCLP(total)}`}
          onPress={confirmar}
          cargando={guardando}
          deshabilitado={!revision.ok}
        />
      </View>
    </Formulario>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.nota}>{etiqueta}</Text>
      <Text style={estilos.valor}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  resumen: { marginBottom: 16, gap: 4 },
  fila: { flexDirection: 'row', justifyContent: 'space-between' },
  nota: { fontSize: 15, color: colores.textoSecundario },
  valor: { fontSize: 15, fontWeight: '600', color: colores.texto },
  etiqueta: { marginBottom: 6, fontSize: 14, fontWeight: '500', color: colores.texto },
  bloque: { marginTop: 16 },
  enlace: { marginTop: 12, fontSize: 15, color: colores.primario },
  rapidos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  textoChip: { fontSize: 15, color: colores.texto },
  textoChipActivo: { color: colores.superficie, fontWeight: '600' },
  vuelto: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
  },
  textoVuelto: { fontSize: 18, color: colores.exito },
  montoVuelto: { fontSize: 28, fontWeight: '700', color: colores.exito },
  falta: { marginTop: 12, fontSize: 15, color: colores.error },
  confirmar: { marginTop: 24 },
});
