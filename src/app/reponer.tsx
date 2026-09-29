import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import { obtenerNegocio } from '@/db/negocio';
import { listarParaReponer, type Producto } from '@/db/productos';
import { formatearFecha } from '@/lib/formato';
import { formatearCantidad } from '@/lib/numeros';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

/** Productos bajo el stock mínimo o sin stock. */
export default function ReponerScreen() {
  const db = useSQLiteContext();
  const { negocioId, versionDatos } = useSesion();
  const [productos, setProductos] = useState<Producto[]>([]);

  useEffect(() => {
    if (negocioId) listarParaReponer(db, negocioId).then(setProductos);
  }, [db, negocioId, versionDatos]);

  const unidad = (p: Producto) => (p.unidad === 'kg' ? ' kg' : '');

  const compartir = async () => {
    const negocio = negocioId ? await obtenerNegocio(db, negocioId) : null;
    const lineas = productos.map(
      (p) =>
        `- ${p.nombre}: quedan ${formatearCantidad(Math.max(0, p.stock))}${unidad(p)}` +
        (p.stockMinimo ? ` (mínimo ${formatearCantidad(p.stockMinimo)})` : ''),
    );
    await Share.share({
      message: [
        `Por reponer · ${negocio?.nombre ?? ''} · ${formatearFecha(new Date())}`,
        '',
        ...lineas,
      ].join('\n'),
    });
  };

  return (
    <Formulario
      titulo="Por reponer"
      subtitulo="Productos sin stock o que bajaron del mínimo que definiste en su ficha."
    >
      {productos.length === 0 ? (
        <Text style={estilos.nota}>Todo en orden: no hay productos por reponer.</Text>
      ) : null}
      {productos.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() => router.push(`/producto/${p.id}`)}
          style={estilos.fila}
        >
          <View style={estilos.flex}>
            <Text style={estilos.nombre}>{p.nombre}</Text>
            <Text style={estilos.nota}>{p.categoria ?? 'Sin categoría'}</Text>
          </View>
          <View style={estilos.derecha}>
            <Text style={[estilos.stock, p.stock <= 0 ? estilos.rojo : estilos.naranjo]}>
              {p.stock <= 0 ? 'Sin stock' : `Quedan ${formatearCantidad(p.stock)}${unidad(p)}`}
            </Text>
            {p.stockMinimo ? (
              <Text style={estilos.nota}>Mínimo {formatearCantidad(p.stockMinimo)}</Text>
            ) : null}
          </View>
        </Pressable>
      ))}
      {productos.length ? (
        <View style={estilos.botones}>
          <Boton titulo="Compartir lista" variante="secundario" onPress={compartir} />
          <Boton titulo="Registrar ingreso de mercadería" onPress={() => router.push('/compra')} />
        </View>
      ) : null}
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  nombre: { fontSize: 16, fontWeight: '600', color: colores.texto },
  nota: { fontSize: 13, color: colores.textoSecundario },
  derecha: { alignItems: 'flex-end' },
  stock: { fontSize: 15, fontWeight: '600' },
  rojo: { color: colores.error },
  naranjo: { color: colores.aviso },
  botones: { marginTop: 12, gap: 10 },
});
