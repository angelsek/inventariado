import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useBase } from '@/db/proveedor';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import { compartirArchivo } from '@/features/exportar/compartir';
import { csvProductos, csvVentas, respaldoJson } from '@/features/exportar/exportar';
import { bloqueadoSinPlanPagado, usePlanPagado } from '@/features/suscripcion/planPagado';
import { informarError } from '@/lib/errores';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Descargar los datos del negocio para Excel o como respaldo. */
export default function ExportarScreen() {
  const db = useBase();
  const negocioId = useSesion((s) => s.negocioId);
  // Los CSV para Excel son del plan pagado; el respaldo completo, siempre.
  const pagado = usePlanPagado();
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
      await compartirArchivo(nombre, tipo, await generar());
    } catch (e) {
      setError('No se pudo exportar. Inténtalo de nuevo.');
      informarError(e, 'Exportar');
    } finally {
      setTrabajando(null);
    }
  };

  /** Igual que `compartir`, pero solo con el plan pagado. */
  const compartirPagado = (
    clave: string,
    nombre: string,
    tipo: string,
    generar: () => Promise<string>,
  ) => {
    if (bloqueadoSinPlanPagado()) return;
    compartir(clave, nombre, tipo, generar);
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
      {pagado ? null : (
        <View style={estilos.tarjetaCandado}>
          <View style={estilos.encabezado}>
            <Ionicons name="lock-closed" size={20} color={colores.aviso} />
            <Text style={estilos.titulo}>Exportar a Excel es del plan pagado</Text>
          </View>
          <Text style={estilos.texto}>
            Mientras no tengas un plan pagado al día no puedes pasar tus productos ni tus ventas a
            Excel. El respaldo completo de tu negocio sí: está más abajo y lo puedes descargar
            siempre.
          </Text>
          <Boton titulo="Ver planes" onPress={() => router.push('/suscripcion')} />
        </View>
      )}

      <Seccion
        titulo="Productos (CSV)"
        texto="Catálogo con precios, costos y stock. Se puede editar en Excel y volver a importar."
        bloqueada={!pagado}
      >
        <Boton
          titulo="Exportar productos"
          cargando={trabajando === 'productos'}
          onPress={() =>
            compartirPagado('productos', `productos-${hoy()}.csv`, 'text/csv', () =>
              csvProductos(db, negocioId!),
            )
          }
        />
      </Seccion>

      <Seccion
        titulo="Ventas (CSV)"
        texto="Una fila por producto vendido, con precio, costo y vendedor."
        bloqueada={!pagado}
      >
        <View style={estilos.botones}>
          <Boton
            titulo="Ventas de este mes"
            cargando={trabajando === 'mes'}
            onPress={() =>
              compartirPagado('mes', `ventas-${hoy()}.csv`, 'text/csv', () => {
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
              compartirPagado('anterior', `ventas-mes-anterior-${hoy()}.csv`, 'text/csv', () => {
                const { desde, hasta } = mesAnterior();
                return csvVentas(db, negocioId!, desde, hasta);
              })
            }
          />
        </View>
      </Seccion>

      <Seccion
        titulo="Respaldo completo (JSON)"
        texto="Todos los datos del negocio guardados en este equipo. Siempre lo puedes descargar, también con la prueba gratis. Guárdalo en un lugar seguro."
      >
        <Boton
          titulo="Descargar respaldo"
          variante="secundario"
          cargando={trabajando === 'respaldo'}
          onPress={() =>
            compartir('respaldo', `respaldo-stockeao-${hoy()}.json`, 'application/json', () =>
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
  bloqueada,
  children,
}: {
  titulo: string;
  texto: string;
  /** Con candado: se ve de qué se trata, pero sin los botones. */
  bloqueada?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={estilos.tarjeta}>
      <View style={estilos.encabezado}>
        {bloqueada ? <Ionicons name="lock-closed" size={18} color={colores.inactivo} /> : null}
        <Text style={[estilos.titulo, bloqueada && estilos.tituloBloqueado]}>{titulo}</Text>
      </View>
      <Text style={estilos.texto}>{texto}</Text>
      {bloqueada ? null : children}
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
  tarjetaCandado: {
    padding: 16,
    marginBottom: 12,
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.aviso,
    backgroundColor: colores.superficie,
  },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { flex: 1, fontSize: 17, fontWeight: '700', color: colores.texto },
  tituloBloqueado: { color: colores.textoSecundario },
  texto: { fontSize: 14, color: colores.textoSecundario },
  botones: { gap: 10 },
});
