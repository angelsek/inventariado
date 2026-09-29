import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import { csvProductos, csvVentas, respaldoJson } from '@/features/exportar/exportar';
import { informarError } from '@/lib/errores';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Descargar los datos del negocio para Excel o como respaldo. */
export default function ExportarScreen() {
  const db = useSQLiteContext();
  const negocioId = useSesion((s) => s.negocioId);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const compartir = async (
    clave: string,
    nombre: string,
    tipo: string,
    generar: () => Promise<string>,
  ) => {
    setTrabajando(clave);
    setError(null);
    try {
      const archivo = new File(Paths.cache, nombre);
      if (archivo.exists) archivo.delete();
      archivo.create();
      archivo.write(await generar());
      await shareAsync(archivo.uri, { mimeType: tipo, dialogTitle: nombre });
    } catch (e) {
      setError('No se pudo exportar. Inténtalo de nuevo.');
      informarError(e, 'Exportar');
    } finally {
      setTrabajando(null);
    }
  };

  const mesActual = () => {
    const ahora = new Date();
    return {
      desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString(),
      hasta: new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1).toISOString(),
    };
  };
  const mesAnterior = () => {
    const ahora = new Date();
    return {
      desde: new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1).toISOString(),
      hasta: new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString(),
    };
  };

  return (
    <Formulario
      titulo="Exportar datos"
      subtitulo="Los archivos se pueden abrir en Excel o guardar en Drive, correo o WhatsApp."
      error={error}
    >
      <Seccion
        titulo="Productos (CSV)"
        texto="Catálogo con precios, costos y stock. Se puede editar en Excel y volver a importar."
      >
        <Boton
          titulo="Exportar productos"
          cargando={trabajando === 'productos'}
          onPress={() =>
            compartir('productos', `productos-${hoy()}.csv`, 'text/csv', () =>
              csvProductos(db, negocioId!),
            )
          }
        />
      </Seccion>

      <Seccion
        titulo="Ventas (CSV)"
        texto="Una fila por producto vendido, con precio, costo y vendedor."
      >
        <View style={estilos.botones}>
          <Boton
            titulo="Ventas de este mes"
            cargando={trabajando === 'mes'}
            onPress={() =>
              compartir('mes', `ventas-${hoy()}.csv`, 'text/csv', () => {
                const { desde, hasta } = mesActual();
                return csvVentas(db, negocioId!, desde, hasta);
              })
            }
          />
          <Boton
            titulo="Ventas del mes anterior"
            variante="secundario"
            cargando={trabajando === 'anterior'}
            onPress={() =>
              compartir('anterior', `ventas-mes-anterior-${hoy()}.csv`, 'text/csv', () => {
                const { desde, hasta } = mesAnterior();
                return csvVentas(db, negocioId!, desde, hasta);
              })
            }
          />
        </View>
      </Seccion>

      <Seccion
        titulo="Respaldo completo (JSON)"
        texto="Todos los datos del negocio guardados en este teléfono. Guárdalo en un lugar seguro."
      >
        <Boton
          titulo="Descargar respaldo"
          variante="secundario"
          cargando={trabajando === 'respaldo'}
          onPress={() =>
            compartir('respaldo', `respaldo-inventariado-${hoy()}.json`, 'application/json', () =>
              respaldoJson(db, negocioId!),
            )
          }
        />
      </Seccion>
    </Formulario>
  );
}

function Seccion({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto: string;
  children: React.ReactNode;
}) {
  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.texto}>{texto}</Text>
      {children}
    </View>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    padding: 16,
    marginBottom: 12,
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  titulo: { fontSize: 17, fontWeight: '700', color: colores.texto },
  texto: { fontSize: 14, color: colores.textoSecundario },
  botones: { gap: 10 },
});
