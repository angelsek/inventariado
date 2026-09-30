import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { Selector } from '@/components/Selector';
import { obtenerCajaAbierta } from '@/db/cajas';
import { type Cliente, obtenerCliente, revisarLimite } from '@/db/clientes';
import { obtenerNegocio } from '@/db/negocio';
import { registrarVenta } from '@/db/ventas';
import { dentroDelHorario } from '@/features/alcohol/horario';
import { ElegirCliente } from '@/features/fiado/ElegirCliente';
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
import { bloqueadoPorSuscripcion } from '@/features/suscripcion/useSoloLectura';

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
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [eligiendoCliente, setEligiendoCliente] = useState(false);

  // Al elegir "Fiado" se pregunta a quién.
  const cambiarMedio = (valor: MedioPago, fijar: (v: MedioPago) => void) => {
    fijar(valor);
    if (valor === 'fiado' && !cliente) setEligiendoCliente(true);
  };

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
  const montoFiado = pagos.filter((p) => p.medio === 'fiado').reduce((s, p) => s + p.monto, 0);
  const revision = revisarPagos(total, pagos, usaEfectivo ? recibidoNumero : null);

  if (carrito.items.length === 0) {
    return (
      <Formulario titulo="Cobrar">
        <Text style={estilos.nota}>No hay productos en la venta.</Text>
        <Boton titulo="Volver" onPress={() => router.back()} />
      </Formulario>
    );
  }

  const registrar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const autor = await obtenerAutor(db);
      const caja = await obtenerCajaAbierta(db, negocioId!, autor.dispositivoId);
      const ventaId = await registrarVenta(db, {
        negocioId: negocioId!,
        items: carrito.items,
        descuentoGeneral: descuentoAplicado,
        pagos: revision.ok ? revision.pagos : [],
        efectivoRecibido: revision.ok ? revision.efectivoRecibido : null,
        vuelto: revision.ok ? revision.vuelto : null,
        cajaId: caja?.id ?? null,
        clienteId: montoFiado > 0 ? cliente?.id : null,
        autor,
      });
      carrito.vaciar();
      datosCambiaron();
      sincronizarAhora(db);
      router.replace({ pathname: '/venta/[id]', params: { id: ventaId, recien: '1' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGuardando(false);
    }
  };

  const confirmar = async () => {
    if (bloqueadoPorSuscripcion()) return;
    if (!revision.ok) return setError(revision.error);

    if (montoFiado > 0) {
      if (!cliente) {
        setEligiendoCliente(true);
        return setError('Elige a qué cliente se le fía.');
      }
      // Saldo al día (puede haber cambiado desde que se eligió).
      const actual = await obtenerCliente(db, cliente.id);
      const problema = actual && revisarLimite(actual, montoFiado);
      if (problema) return setError(problema);
    }

    if (carrito.items.some((i) => i.alcohol)) {
      const negocio = await obtenerNegocio(db, negocioId!);
      const fuera = !dentroDelHorario(
        new Date(),
        negocio?.alcoholDesde ?? null,
        negocio?.alcoholHasta ?? null,
      );
      Alert.alert(
        'Venta de alcohol',
        (fuera
          ? `Atención: estás fuera del horario de venta de alcohol (${negocio?.alcoholDesde} a ${negocio?.alcoholHasta}).\n\n`
          : '') + 'Confirma que el cliente es mayor de 18 años.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Es mayor de 18', onPress: registrar },
        ],
      );
      return;
    }
    await registrar();
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
      <Selector opciones={MEDIOS_PAGO} valor={medio} onCambio={(v) => cambiarMedio(v, setMedio)} />

      {mixto ? (
        <View style={estilos.bloque}>
          <Text style={estilos.etiqueta}>Segundo medio de pago</Text>
          <Selector
            opciones={MEDIOS_PAGO}
            valor={medioSegundo}
            onCambio={(v) => cambiarMedio(v, setMedioSegundo)}
          />
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

      {montoFiado > 0 ? (
        <View style={estilos.fiado}>
          <Text style={estilos.textoFiado}>
            {cliente
              ? `Fiado a ${cliente.nombre}: ${formatearCLP(montoFiado)}${cliente.saldo > 0 ? ` (ya debe ${formatearCLP(cliente.saldo)})` : ''}`
              : `Fiado: ${formatearCLP(montoFiado)}`}
          </Text>
          <Text
            accessibilityRole="button"
            style={estilos.enlace}
            onPress={() => setEligiendoCliente(true)}
          >
            {cliente ? 'Cambiar cliente' : 'Elegir cliente'}
          </Text>
        </View>
      ) : null}

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
      <ElegirCliente
        visible={eligiendoCliente}
        onCerrar={() => setEligiendoCliente(false)}
        onElegir={(c) => {
          setCliente(c);
          setEligiendoCliente(false);
          setError(null);
        }}
      />
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
  fiado: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF3E0',
  },
  textoFiado: { fontSize: 15, fontWeight: '600', color: colores.aviso },
  confirmar: { marginTop: 24 },
});
