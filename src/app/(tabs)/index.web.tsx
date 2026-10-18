import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, Redirect, router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useResumenDelDia } from '@/features/inicio/useResumenDelDia';
import { formatearCLP } from '@/lib/formato';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

/**
 * Web (PC): "Resumen de hoy", panel del dueño con los números del día. Sin accesos a otras
 * pantallas que ya están en el menú lateral. El cajero no lo ve: va directo a la caja.
 * La pantalla del teléfono es index.tsx.
 */
export default function ResumenDeHoy() {
  const perfil = useSesion((s) => s.perfil);
  const resumen = useResumenDelDia();

  if (perfil && perfil.rol !== 'dueno') return <Redirect href="/vender" />;

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.saludo}>
        Hola, {perfil?.nombre}
        {resumen?.negocio ? <Text style={estilos.negocio}> · {resumen.negocio}</Text> : null}
      </Text>

      <View style={estilos.indicadores}>
        <Indicador
          icono="cash-outline"
          etiqueta="Vendido hoy"
          valor={resumen ? formatearCLP(resumen.ventasHoy) : '—'}
          ruta="/ventas"
        />
        <Indicador
          icono="receipt-outline"
          etiqueta="Ventas de hoy"
          valor={resumen ? String(resumen.cantidadHoy) : '—'}
          ruta="/ventas"
        />
        <Indicador
          icono="alert-circle-outline"
          etiqueta="Stock bajo"
          valor={resumen ? String(resumen.stockBajo) : '—'}
          color={resumen?.stockBajo ? colores.aviso : undefined}
          ruta="/reponer"
        />
        <Indicador
          icono="close-circle-outline"
          etiqueta="Sin stock"
          valor={resumen ? String(resumen.sinStock) : '—'}
          color={resumen?.sinStock ? colores.error : undefined}
          ruta="/reponer"
        />
      </View>

      {resumen ? (
        <View style={estilos.caja}>
          <View
            style={[
              estilos.puntoCaja,
              { backgroundColor: resumen.cajaAbierta ? colores.exito : colores.aviso },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={estilos.tituloCaja}>
              {resumen.cajaAbierta ? 'Caja abierta en este PC' : 'Caja cerrada en este PC'}
            </Text>
            <Text style={estilos.notaCaja}>
              {resumen.cajaAbierta
                ? 'Las ventas de este equipo quedan en el turno abierto.'
                : 'Ábrela al empezar el turno para cuadrar el efectivo al cerrar.'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.navigate('/caja')}
            style={estilos.botonCaja}
          >
            <Text style={estilos.textoBotonCaja}>
              {resumen.cajaAbierta ? 'Ver caja' : 'Abrir caja'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Indicador({
  icono,
  etiqueta,
  valor,
  color,
  ruta,
}: {
  icono: NombreIcono;
  etiqueta: string;
  valor: string;
  color?: string;
  ruta: Href;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.navigate(ruta)}
      style={estilos.indicador}
    >
      <View style={estilos.cabeceraIndicador}>
        <Ionicons name={icono} size={18} color={colores.textoSecundario} />
        <Text style={estilos.etiqueta}>{etiqueta}</Text>
      </View>
      <Text style={[estilos.valor, color ? { color } : null]}>{valor}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { width: '100%', maxWidth: 1100, alignSelf: 'center', padding: 24, gap: 20 },
  saludo: { fontSize: 22, fontWeight: '700', color: colores.texto },
  negocio: { fontSize: 17, fontWeight: '400', color: colores.textoSecundario },
  indicadores: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  indicador: {
    flexGrow: 1,
    flexBasis: 200,
    padding: 18,
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  cabeceraIndicador: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  etiqueta: { fontSize: 14, color: colores.textoSecundario },
  valor: { fontSize: 30, fontWeight: '800', color: colores.texto },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  puntoCaja: { width: 12, height: 12, borderRadius: 6 },
  tituloCaja: { fontSize: 16, fontWeight: '700', color: colores.texto },
  notaCaja: { marginTop: 2, fontSize: 14, color: colores.textoSecundario },
  botonCaja: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colores.primario,
  },
  textoBotonCaja: { fontSize: 15, fontWeight: '700', color: colores.superficie },
});
