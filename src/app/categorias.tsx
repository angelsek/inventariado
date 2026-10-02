import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import {
  CATEGORIAS_SUGERIDAS,
  type Categoria,
  crearCategoria,
  eliminarCategoria,
  listarCategorias,
  marcarAlcohol,
  renombrarCategoria,
} from '@/db/categorias';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

export default function CategoriasScreen() {
  const db = useSQLiteContext();
  const { negocioId, versionDatos, datosCambiaron } = useSesion();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nueva, setNueva] = useState('');
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);

  const recargar = useCallback(() => {
    if (negocioId) listarCategorias(db, negocioId).then(setCategorias);
  }, [db, negocioId]);

  useEffect(recargar, [recargar, versionDatos]);

  const listo = () => {
    datosCambiaron();
    sincronizarAhora(db);
  };

  const agregar = async (nombre: string) => {
    if (!nombre.trim()) return;
    await crearCategoria(db, negocioId!, nombre);
    setNueva('');
    listo();
  };

  const agregarSugeridas = async () => {
    for (const nombre of CATEGORIAS_SUGERIDAS) await crearCategoria(db, negocioId!, nombre);
    listo();
  };

  const guardarNombre = async () => {
    if (editando?.nombre.trim()) await renombrarCategoria(db, editando.id, editando.nombre);
    setEditando(null);
    listo();
  };

  const confirmarEliminar = (categoria: Categoria) =>
    Alert.alert(
      'Eliminar categoría',
      `¿Eliminar "${categoria.nombre}"? Sus productos quedarán sin categoría.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await eliminarCategoria(db, categoria.id);
            listo();
          },
        },
      ],
    );

  return (
    <Formulario
      titulo="Categorías"
      subtitulo="Agrupan los productos para encontrarlos más rápido. Al vender productos de una categoría de alcohol, la app pide confirmar que el cliente es mayor de edad."
    >
      {categorias.map((c) => (
        <View key={c.id} style={estilos.fila}>
          {editando?.id === c.id ? (
            <TextInput
              accessibilityLabel={`Nuevo nombre para ${c.nombre}`}
              autoFocus
              value={editando.nombre}
              onChangeText={(nombre) => setEditando({ id: c.id, nombre })}
              onSubmitEditing={guardarNombre}
              onBlur={guardarNombre}
              style={[estilos.nombre, estilos.entrada]}
            />
          ) : (
            <View style={estilos.nombre}>
              <Text style={estilos.textoNombre}>{c.nombre}</Text>
              <Text
                accessibilityRole="checkbox"
                accessibilityState={{ checked: c.alcohol }}
                accessibilityLabel={`${c.nombre} es alcohol`}
                style={[estilos.alcohol, c.alcohol && estilos.alcoholActivo]}
                onPress={async () => {
                  await marcarAlcohol(db, c.id, !c.alcohol);
                  listo();
                }}
              >
                {c.alcohol ? '✓ Alcohol (pide mayoría de edad)' : 'Marcar como alcohol'}
              </Text>
            </View>
          )}
          <Text
            accessibilityRole="button"
            style={estilos.enlace}
            onPress={() => setEditando({ id: c.id, nombre: c.nombre })}
          >
            Renombrar
          </Text>
          <Text
            accessibilityRole="button"
            style={[estilos.enlace, estilos.peligro]}
            onPress={() => confirmarEliminar(c)}
          >
            Eliminar
          </Text>
        </View>
      ))}

      {categorias.length === 0 ? (
        <View style={estilos.sugeridas}>
          <Text style={estilos.nota}>{CATEGORIAS_SUGERIDAS.join(', ')}</Text>
          <Boton titulo="Agregar categorías sugeridas" onPress={agregarSugeridas} />
        </View>
      ) : null}

      <Text style={estilos.seccion}>Nueva categoría</Text>
      <TextInput
        accessibilityLabel="Nombre de la nueva categoría"
        placeholder="Ej: Hielo"
        placeholderTextColor={colores.inactivo}
        value={nueva}
        onChangeText={setNueva}
        onSubmitEditing={() => agregar(nueva)}
        style={[estilos.entrada, estilos.entradaNueva]}
      />
      <Boton titulo="Agregar" variante="secundario" onPress={() => agregar(nueva)} />
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  nombre: { flex: 1, fontSize: 16, color: colores.texto },
  textoNombre: { fontSize: 16, color: colores.texto },
  alcohol: { marginTop: 4, fontSize: 13, color: colores.textoSecundario },
  alcoholActivo: { color: colores.aviso, fontWeight: '600' },
  entrada: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colores.texto,
    backgroundColor: colores.superficie,
  },
  entradaNueva: { marginBottom: 12 },
  enlace: { fontSize: 14, color: colores.primario },
  peligro: { color: colores.error },
  sugeridas: { gap: 12, marginBottom: 8 },
  nota: { fontSize: 14, color: colores.textoSecundario },
  seccion: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
});
