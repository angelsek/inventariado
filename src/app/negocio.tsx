import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { actualizarNegocio, obtenerNegocio } from '@/db/negocio';
import { normalizarHora } from '@/features/alcohol/horario';
import { esRutValido } from '@/lib/validacion';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

/** Datos del negocio y horario de venta de alcohol (solo dueño). */
export default function NegocioScreen() {
  const db = useSQLiteContext();
  const { negocioId, datosCambiaron } = useSesion();
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [direccion, setDireccion] = useState('');
  const [controlAlcohol, setControlAlcohol] = useState(false);
  const [desde, setDesde] = useState('10:00');
  const [hasta, setHasta] = useState('02:00');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!negocioId) return;
    obtenerNegocio(db, negocioId).then((n) => {
      if (!n) return;
      setNombre(n.nombre);
      setRut(n.rut ?? '');
      setDireccion(n.direccion ?? '');
      setControlAlcohol(!!n.alcoholDesde && !!n.alcoholHasta);
      if (n.alcoholDesde) setDesde(n.alcoholDesde);
      if (n.alcoholHasta) setHasta(n.alcoholHasta);
    });
  }, [db, negocioId]);

  const guardar = async () => {
    const e: Record<string, string> = {};
    if (!nombre.trim()) e.nombre = 'Ingresa el nombre del negocio.';
    if (rut.trim() && !esRutValido(rut)) e.rut = 'El RUT no es válido.';
    const horaDesde = normalizarHora(desde);
    const horaHasta = normalizarHora(hasta);
    if (controlAlcohol && !horaDesde) e.desde = 'Hora no válida (ej. 10:00).';
    if (controlAlcohol && !horaHasta) e.hasta = 'Hora no válida (ej. 02:00).';
    setErrores(e);
    if (Object.keys(e).length) return;

    setGuardando(true);
    await actualizarNegocio(db, negocioId!, {
      nombre,
      rut,
      direccion,
      alcoholDesde: controlAlcohol ? horaDesde : null,
      alcoholHasta: controlAlcohol ? horaHasta : null,
    });
    datosCambiaron();
    sincronizarAhora(db);
    router.back();
  };

  return (
    <Formulario titulo="Datos del negocio">
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} error={errores.nombre} />
      <Campo
        etiqueta="RUT (opcional)"
        value={rut}
        onChangeText={setRut}
        autoCapitalize="characters"
        error={errores.rut}
      />
      <Campo etiqueta="Dirección (opcional)" value={direccion} onChangeText={setDireccion} />

      <Text style={estilos.seccion}>Venta de alcohol</Text>
      <View style={estilos.fila}>
        <Text style={estilos.textoFila}>Avisar si se vende fuera del horario de la patente</Text>
        <Switch
          accessibilityLabel="Controlar horario de venta de alcohol"
          value={controlAlcohol}
          onValueChange={setControlAlcohol}
          trackColor={{ true: colores.primario }}
        />
      </View>
      {controlAlcohol ? (
        <View style={estilos.horas}>
          <View style={estilos.hora}>
            <Campo
              etiqueta="Desde"
              value={desde}
              onChangeText={setDesde}
              keyboardType="numbers-and-punctuation"
              error={errores.desde}
            />
          </View>
          <View style={estilos.hora}>
            <Campo
              etiqueta="Hasta"
              value={hasta}
              onChangeText={setHasta}
              keyboardType="numbers-and-punctuation"
              error={errores.hasta}
            />
          </View>
        </View>
      ) : null}
      <Text style={estilos.nota}>
        Los productos de categorías marcadas como alcohol siempre piden confirmar que el cliente es
        mayor de 18 años. Las categorías se marcan en Inventario → Categorías.
      </Text>

      <View style={estilos.guardar}>
        <Boton titulo="Guardar" onPress={guardar} cargando={guardando} />
      </View>
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  seccion: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  textoFila: { flex: 1, fontSize: 15, color: colores.texto },
  horas: { flexDirection: 'row', gap: 12 },
  hora: { flex: 1 },
  nota: { fontSize: 13, color: colores.textoSecundario },
  guardar: { marginTop: 24 },
});
