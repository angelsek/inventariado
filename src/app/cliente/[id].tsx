import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { Hoja } from '@/components/Hoja';
import { Selector } from '@/components/Selector';
import { obtenerCajaAbierta } from '@/db/cajas';
import {
  actualizarCliente,
  type Cliente,
  crearCliente,
  listarMovimientosCliente,
  type MovimientoCliente,
  obtenerCliente,
  registrarAbono,
} from '@/db/clientes';
import { obtenerNegocio } from '@/db/negocio';
import { etiquetaMovimientoCliente, textoEstadoCuenta } from '@/features/fiado/estadoCuenta';
import { bloqueadoPorSuscripcion } from '@/features/suscripcion/useSoloLectura';
import { etiquetaMedio, MEDIOS_ABONO, type MedioPago } from '@/features/ventas/calculos';
import { formatearCLP, formatearFechaHora } from '@/lib/formato';
import { parsearMonto } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

const soloDigitos = (v: string) => v.replace(/\D/g, '');

export default function ClienteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const { negocioId, perfil, versionDatos, datosCambiaron } = useSesion();
  const esDueno = perfil?.rol === 'dueno';
  const nuevo = id === 'nuevo';

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoCliente[]>([]);
  const [editando, setEditando] = useState(nuevo);
  const [pagando, setPagando] = useState(false);

  const recargar = useCallback(() => {
    if (nuevo || !id) return;
    obtenerCliente(db, id).then(setCliente);
    listarMovimientosCliente(db, id).then(setMovimientos);
  }, [db, id, nuevo]);

  useEffect(recargar, [recargar, versionDatos]);

  const listo = () => {
    datosCambiaron();
    sincronizarAhora(db);
  };

  if (editando) {
    return (
      <FormCliente
        key={cliente?.id ?? 'nuevo'}
        cliente={cliente}
        onGuardar={async (datos) => {
          if (nuevo) {
            const nuevoId = await crearCliente(db, negocioId!, datos);
            listo();
            router.replace({ pathname: '/cliente/[id]', params: { id: nuevoId } });
          } else {
            await actualizarCliente(db, cliente!.id, datos);
            listo();
            setEditando(false);
          }
        }}
      />
    );
  }

  if (!cliente) return null;

  const compartir = async () => {
    const negocio = await obtenerNegocio(db, negocioId!);
    await Share.share({
      message: textoEstadoCuenta(negocio?.nombre ?? '', cliente, movimientos),
    });
  };

  return (
    <Formulario titulo={cliente.nombre} subtitulo={cliente.telefono ?? undefined}>
      <View style={estilos.saldo}>
        <Text style={estilos.etiqueta}>
          {cliente.saldo > 0 ? 'Debe' : cliente.saldo < 0 ? 'Saldo a favor' : 'Sin deuda'}
        </Text>
        <Text style={[estilos.monto, cliente.saldo > 0 && estilos.debe]}>
          {formatearCLP(cliente.saldo)}
        </Text>
        {cliente.limiteCredito > 0 ? (
          <Text style={estilos.nota}>
            Límite {formatearCLP(cliente.limiteCredito)} · disponible{' '}
            {formatearCLP(Math.max(0, cliente.limiteCredito - cliente.saldo))}
          </Text>
        ) : null}
        {!cliente.activo ? <Text style={estilos.nota}>Cliente desactivado</Text> : null}
      </View>

      <View style={estilos.botones}>
        <Boton
          titulo="Registrar pago"
          deshabilitado={cliente.saldo <= 0}
          onPress={() => {
            if (!bloqueadoPorSuscripcion()) setPagando(true);
          }}
        />
        <Boton titulo="Enviar estado de cuenta" variante="secundario" onPress={compartir} />
        {esDueno ? (
          <Boton titulo="Editar datos" variante="secundario" onPress={() => setEditando(true)} />
        ) : null}
      </View>

      <Text style={estilos.seccion}>Movimientos</Text>
      {movimientos.map((m) => (
        <Pressable
          key={m.id}
          accessibilityRole={m.ventaId ? 'button' : undefined}
          disabled={!m.ventaId}
          onPress={() =>
            m.ventaId && router.push({ pathname: '/venta/[id]', params: { id: m.ventaId } })
          }
          style={estilos.movimiento}
        >
          <View style={estilos.flex}>
            <Text style={estilos.tipo}>
              {etiquetaMovimientoCliente(m.tipo)}
              {m.medio ? ` · ${etiquetaMedio(m.medio)}` : ''}
            </Text>
            <Text style={estilos.nota}>
              {formatearFechaHora(new Date(m.creadoEn))}
              {m.perfil ? ` · ${m.perfil}` : ''}
              {m.notas ? ` · ${m.notas}` : ''}
            </Text>
          </View>
          <Text style={[estilos.valor, m.tipo === 'cargo' ? estilos.debe : estilos.paga]}>
            {m.tipo === 'cargo' ? '+' : '-'}
            {formatearCLP(m.monto)}
          </Text>
        </Pressable>
      ))}
      {movimientos.length === 0 ? <Text style={estilos.nota}>Sin movimientos.</Text> : null}

      <HojaPago
        visible={pagando}
        cliente={cliente}
        onCerrar={() => setPagando(false)}
        onPagar={async (monto, medio, notas) => {
          const autor = await obtenerAutor(db);
          const caja = await obtenerCajaAbierta(db, negocioId!, autor.dispositivoId);
          await registrarAbono(db, {
            negocioId: negocioId!,
            clienteId: cliente.id,
            monto,
            medio,
            notas,
            cajaId: caja?.id ?? null,
            autor,
          });
          setPagando(false);
          listo();
          recargar();
        }}
      />
    </Formulario>
  );
}

function HojaPago({
  visible,
  cliente,
  onCerrar,
  onPagar,
}: {
  visible: boolean;
  cliente: Cliente;
  onCerrar: () => void;
  onPagar: (monto: number, medio: Exclude<MedioPago, 'fiado'>, notas: string) => Promise<void>;
}) {
  const [monto, setMonto] = useState('');
  const [medio, setMedio] = useState<Exclude<MedioPago, 'fiado'>>('efectivo');
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const valor = parsearMonto(monto || '0') ?? 0;

  const pagar = async () => {
    if (valor <= 0) return setError('Ingresa el monto.');
    if (valor > cliente.saldo) return setError(`Debe ${formatearCLP(cliente.saldo)}.`);
    setError(null);
    await onPagar(valor, medio, notas);
    setMonto('');
    setNotas('');
  };

  return (
    <Hoja visible={visible} titulo={`Pago de ${cliente.nombre}`} onCerrar={onCerrar}>
      <Campo
        etiqueta="Monto"
        keyboardType="number-pad"
        placeholder={formatearCLP(cliente.saldo)}
        value={monto}
        onChangeText={(v) => setMonto(soloDigitos(v))}
        error={error}
      />
      <Text
        accessibilityRole="button"
        style={estilos.enlace}
        onPress={() => setMonto(String(cliente.saldo))}
      >
        Paga todo ({formatearCLP(cliente.saldo)})
      </Text>
      <Selector
        opciones={MEDIOS_ABONO as { valor: Exclude<MedioPago, 'fiado'>; etiqueta: string }[]}
        valor={medio}
        onCambio={setMedio}
      />
      <Campo etiqueta="Nota (opcional)" value={notas} onChangeText={setNotas} />
      {medio === 'efectivo' ? (
        <Text style={estilos.nota}>Si la caja está abierta, el efectivo entra a la caja.</Text>
      ) : null}
      <View style={estilos.espacio} />
      <Boton titulo={`Registrar pago ${valor > 0 ? formatearCLP(valor) : ''}`} onPress={pagar} />
    </Hoja>
  );
}

function FormCliente({
  cliente,
  onGuardar,
}: {
  cliente: Cliente | null;
  onGuardar: (datos: {
    nombre: string;
    telefono: string | null;
    limiteCredito: number;
    activo: boolean;
  }) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? '');
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '');
  const [limite, setLimite] = useState(cliente?.limiteCredito ? String(cliente.limiteCredito) : '');
  const [activo, setActivo] = useState(cliente?.activo ?? true);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!nombre.trim()) return setError('Ingresa el nombre del cliente.');
    await onGuardar({
      nombre,
      telefono,
      limiteCredito: parsearMonto(limite || '0') ?? 0,
      activo,
    });
  };

  return (
    <Formulario titulo={cliente ? 'Editar cliente' : 'Cliente nuevo'}>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} error={error} />
      <Campo
        etiqueta="Teléfono (opcional)"
        keyboardType="phone-pad"
        value={telefono}
        onChangeText={setTelefono}
        ayuda="Para enviarle el estado de cuenta por WhatsApp."
      />
      <Campo
        etiqueta="Límite de fiado (opcional)"
        keyboardType="number-pad"
        placeholder="Sin límite"
        value={limite}
        onChangeText={(v) => setLimite(soloDigitos(v))}
        ayuda="Deuda máxima permitida. Vacío = sin límite."
      />
      {cliente ? (
        <View style={estilos.filaSwitch}>
          <Text style={estilos.flex}>Cliente activo</Text>
          <Switch
            accessibilityLabel="Cliente activo"
            value={activo}
            onValueChange={setActivo}
            trackColor={{ true: colores.primario }}
          />
        </View>
      ) : null}
      <Boton titulo="Guardar" onPress={guardar} />
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  saldo: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  etiqueta: { fontSize: 14, color: colores.textoSecundario },
  monto: { fontSize: 32, fontWeight: '700', color: colores.exito },
  debe: { color: colores.aviso },
  paga: { color: colores.exito },
  nota: { marginTop: 2, fontSize: 13, color: colores.textoSecundario },
  botones: { gap: 8, marginTop: 16 },
  seccion: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
  movimiento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.borde,
  },
  flex: { flex: 1 },
  tipo: { fontSize: 15, color: colores.texto },
  valor: { fontSize: 15, fontWeight: '700' },
  enlace: { marginTop: -8, marginBottom: 12, fontSize: 14, color: colores.primario },
  espacio: { height: 12 },
  filaSwitch: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
});
