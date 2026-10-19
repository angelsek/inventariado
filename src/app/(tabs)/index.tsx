import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useBase } from '@/db/proveedor';
import { type ComponentProps, useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { obtenerCajaAbierta } from '@/db/cajas';
import { obtenerNegocio } from '@/db/negocio';
import { listarProductos } from '@/db/productos';
import { resumirVentas } from '@/db/ventas';
import { rangoDelDia } from '@/lib/fechas';
import { formatearCLP } from '@/lib/formato';
import { obtenerAutor } from '@/sesion/autor';
import { puedeAbrir } from '@/features/permisos/permisos';
import { usePermisos } from '@/sesion/permisos';
import { useSesion } from '@/sesion/store';
import { colores, radios } from '@/theme/colores';

type NombreIcono = ComponentProps<typeof Ionicons>['name'];

type Resumen = {
  negocio: string;
  ventasHoy: number;
  cantidadHoy: number;
  stockBajo: number;
  sinStock: number;
  cajaAbierta: boolean;
};

// Cada atajo aparece solo si la persona puede abrir su destino (PERMISO_POR_RUTA).
type Atajo = { icono: NombreIcono; texto: string; destino: Href & string };

// Todo lo que se hace en el día, con botones grandes y un solo toque.
const ATAJOS: Atajo[] = [
  // Productos, Vender y Caja están en la barra de abajo.
  { icono: 'receipt-outline', texto: 'Ventas del día', destino: '/ventas' },
  { icono: 'people-outline', texto: 'Clientes y fiado', destino: '/clientes' },
  { icono: 'download-outline', texto: 'Llegó mercadería', destino: '/compra' },
  { icono: 'alert-circle-outline', texto: 'Por reponer', destino: '/reponer' },
  { icono: 'bar-chart-outline', texto: 'Reportes', destino: '/estadisticas' },
  { icono: 'clipboard-outline', texto: 'Contar stock', destino: '/conteo' },
];

/** Pantalla de inicio: resumen del día y accesos grandes a cada tarea. */
export default function InicioScreen() {
  const db = useBase();
  const { negocioId, perfil, versionDatos } = useSesion();
  const permisos = usePermisos();
  const puede = (ruta: string) => puedeAbrir(ruta, permisos);
  // El total vendido lo ve quien ve las ventas o los reportes.
  const veVentas = permisos.includes('ventas_ver') || permisos.includes('reportes');
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const cargar = useCallback(() => {
    if (!negocioId) return;
    const { desde, hasta } = rangoDelDia(new Date());
    Promise.all([
      obtenerNegocio(db, negocioId),
      resumirVentas(db, negocioId, desde, hasta),
      listarProductos(db, negocioId),
      obtenerAutor(db).then(({ dispositivoId }) =>
        obtenerCajaAbierta(db, negocioId, dispositivoId),
      ),
    ]).then(([negocio, ventas, productos, caja]) =>
      setResumen({
        negocio: negocio?.nombre ?? '',
        ventasHoy: ventas.total,
        cantidadHoy: ventas.cantidad,
        sinStock: productos.filter((p) => p.stock <= 0).length,
        stockBajo: productos.filter(
          (p) => p.stock > 0 && p.stockMinimo > 0 && p.stock <= p.stockMinimo,
        ).length,
        cajaAbierta: !!caja,
      }),
    );
  }, [db, negocioId]);

  // Al volver a esta pantalla y cuando llegan datos de otros teléfonos.
  useFocusEffect(cargar);
  useEffect(cargar, [cargar, versionDatos]);

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <Text style={estilos.saludo}>Hola, {perfil?.nombre}</Text>
      {resumen?.negocio ? <Text style={estilos.negocio}>{resumen.negocio}</Text> : null}

      {puede('/vender') ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/vender')}
          style={({ pressed }) => [estilos.vender, pressed && estilos.presionado]}
        >
          <View style={estilos.iconoVender}>
            <Ionicons name="cart" size={34} color={colores.primario} />
          </View>
          <View style={estilos.flex}>
            <Text style={estilos.textoVender}>Nueva venta</Text>
            <Text style={estilos.notaVender}>Escanea o busca los productos</Text>
          </View>
          <Ionicons name="chevron-forward" size={28} color={colores.superficie} />
        </Pressable>
      ) : null}

      {resumen && !resumen.cajaAbierta && puede('/caja') ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate('/caja')}
          style={estilos.avisoCaja}
        >
          <Ionicons name="lock-closed-outline" size={22} color={colores.aviso} />
          <Text style={estilos.textoAvisoCaja}>La caja está cerrada. Toca aquí para abrirla.</Text>
        </Pressable>
      ) : null}

      <Text style={estilos.seccion}>Hoy</Text>
      <View style={estilos.tarjeta}>
        {veVentas ? (
          <>
            <Dato
              etiqueta="Vendido"
              valor={formatearCLP(resumen?.ventasHoy ?? 0)}
              nota={`${resumen?.cantidadHoy ?? 0} venta(s)`}
            />
            <View style={estilos.separador} />
          </>
        ) : null}
        <Dato
          etiqueta="Stock bajo"
          valor={String(resumen?.stockBajo ?? 0)}
          color={resumen?.stockBajo ? colores.aviso : colores.texto}
          onPress={puede('/reponer') ? () => router.push('/reponer') : undefined}
        />
        <View style={estilos.separador} />
        <Dato
          etiqueta="Sin stock"
          valor={String(resumen?.sinStock ?? 0)}
          color={resumen?.sinStock ? colores.error : colores.texto}
          onPress={puede('/reponer') ? () => router.push('/reponer') : undefined}
        />
      </View>

      <Text style={estilos.seccion}>¿Qué quieres hacer?</Text>
      <View style={estilos.grilla}>
        {ATAJOS.filter((a) => puede(a.destino)).map((a) => (
          <Pressable
            key={a.texto}
            accessibilityRole="button"
            onPress={() => router.push(a.destino)}
            style={({ pressed }) => [estilos.atajo, pressed && estilos.presionado]}
          >
            <View style={estilos.iconoAtajo}>
              <Ionicons name={a.icono} size={30} color={colores.primario} />
            </View>
            <Text style={estilos.textoAtajo}>{a.texto}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function Dato({
  etiqueta,
  valor,
  nota,
  color = colores.texto,
  onPress,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  color?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${etiqueta} ${valor}`}
      disabled={!onPress}
      onPress={onPress}
      style={estilos.dato}
    >
      <Text style={estilos.etiquetaDato}>{etiqueta}</Text>
      <Text style={[estilos.valorDato, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {valor}
      </Text>
      {nota ? <Text style={estilos.notaDato}>{nota}</Text> : null}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingBottom: 32 },
  flex: { flex: 1 },
  saludo: { fontSize: 26, fontWeight: '700', color: colores.texto },
  negocio: { marginTop: 2, fontSize: 16, color: colores.textoSecundario },
  vender: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
    padding: 18,
    borderRadius: radios.grande,
    backgroundColor: colores.primario,
  },
  iconoVender: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.superficie,
  },
  textoVender: { fontSize: 22, fontWeight: '700', color: colores.superficie },
  notaVender: { marginTop: 2, fontSize: 15, color: '#CFE0DB' },
  presionado: { opacity: 0.7 },
  avisoCaja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 14,
    borderRadius: radios.medio,
    backgroundColor: colores.fondoAviso,
  },
  textoAvisoCaja: { flex: 1, fontSize: 16, color: colores.aviso },
  seccion: {
    marginTop: 24,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: '700',
    color: colores.texto,
  },
  tarjeta: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: radios.medio,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  separador: { width: 1, backgroundColor: colores.borde },
  dato: { flex: 1, paddingHorizontal: 12 },
  etiquetaDato: { fontSize: 14, color: colores.textoSecundario },
  valorDato: { marginTop: 4, fontSize: 24, fontWeight: '700' },
  notaDato: { marginTop: 2, fontSize: 13, color: colores.textoSecundario },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  atajo: {
    width: '47.5%',
    minHeight: 120,
    padding: 16,
    justifyContent: 'space-between',
    borderRadius: radios.medio,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  iconoAtajo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primarioSuave,
  },
  textoAtajo: { marginTop: 12, fontSize: 17, fontWeight: '600', color: colores.texto },
});
