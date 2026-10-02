import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import {
  type Analisis,
  analizarCsv,
  COLUMNAS_EJEMPLO,
  importarProductos,
} from '@/features/catalogo/importar';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';
import { bloqueadoPorSuscripcion } from '@/features/suscripcion/useSoloLectura';

export default function ImportarScreen() {
  const db = useSQLiteContext();
  const { negocioId, datosCambiaron } = useSesion();
  const [archivo, setArchivo] = useState<string | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const elegir = async () => {
    setError(null);
    setResultado(null);
    const eleccion = await getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (eleccion.canceled) return;
    const elegido = eleccion.assets[0];
    try {
      const texto = await new File(elegido.uri).text();
      setArchivo(elegido.name);
      setAnalisis(analizarCsv(texto));
    } catch {
      setError('No se pudo leer el archivo. Debe ser un CSV (en Excel: Guardar como → CSV).');
    }
  };

  const importar = async () => {
    if (bloqueadoPorSuscripcion()) return;
    if (!analisis) return;
    setImportando(true);
    try {
      const { creados, actualizados } = await importarProductos(
        db,
        negocioId!,
        analisis.filas,
        await obtenerAutor(db),
      );
      datosCambiaron();
      sincronizarAhora(db);
      setResultado(`Listo: ${creados} producto(s) nuevo(s) y ${actualizados} actualizado(s).`);
      setAnalisis(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Formulario
      titulo="Importar productos"
      subtitulo="Carga tu catálogo desde una planilla de Excel guardada como CSV."
      error={error}
    >
      <View style={estilos.tarjeta}>
        <Text style={estilos.titulo}>Cómo preparar la planilla</Text>
        <Text style={estilos.texto}>
          1. La primera fila debe tener los nombres de las columnas. Solo «nombre» es obligatoria:
        </Text>
        <Text style={estilos.codigo}>{COLUMNAS_EJEMPLO}</Text>
        <Text style={estilos.texto}>
          2. Unidad puede ser: unidad, pack o kilo. Los precios van sin decimales (1990 o $1.990).
        </Text>
        <Text style={estilos.texto}>3. En Excel: Archivo → Guardar como → CSV.</Text>
        <Text style={estilos.texto}>
          Si un código de barras ya existe, se actualiza ese producto (su stock no cambia).
        </Text>
      </View>

      <Boton
        titulo={archivo ? 'Elegir otro archivo' : 'Elegir archivo CSV'}
        variante="secundario"
        onPress={elegir}
      />

      {analisis ? (
        <View style={estilos.resumen}>
          <Text style={estilos.titulo}>{archivo}</Text>
          <Text style={estilos.ok}>{analisis.filas.length} producto(s) listos para importar</Text>
          {analisis.errores.length > 0 ? (
            <>
              <Text style={estilos.aviso}>
                {analisis.errores.length} fila(s) con problemas (no se importarán):
              </Text>
              {analisis.errores.slice(0, 10).map((e) => (
                <Text key={e.linea + e.mensaje} style={estilos.error}>
                  Fila {e.linea}: {e.mensaje}
                </Text>
              ))}
              {analisis.errores.length > 10 ? (
                <Text style={estilos.error}>… y {analisis.errores.length - 10} más.</Text>
              ) : null}
            </>
          ) : null}
          {analisis.filas.length > 0 ? (
            <Boton titulo="Importar" onPress={importar} cargando={importando} />
          ) : null}
        </View>
      ) : null}

      {resultado ? (
        <View style={estilos.resumen}>
          <Text style={estilos.ok}>{resultado}</Text>
          <Boton titulo="Ver inventario" onPress={() => router.back()} />
        </View>
      ) : null}
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    padding: 16,
    marginBottom: 16,
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  titulo: { fontSize: 16, fontWeight: '600', color: colores.texto },
  texto: { fontSize: 14, color: colores.textoSecundario },
  codigo: {
    padding: 8,
    borderRadius: 6,
    fontFamily: 'monospace',
    fontSize: 12,
    color: colores.texto,
    backgroundColor: colores.fondo,
  },
  resumen: { marginTop: 20, gap: 8 },
  ok: { fontSize: 15, color: colores.exito },
  aviso: { fontSize: 15, color: colores.aviso },
  error: { fontSize: 13, color: colores.error },
});
