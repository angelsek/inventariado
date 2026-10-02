import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Formulario } from '@/components/Formulario';
import { Selector } from '@/components/Selector';
import { formatearFechaHora } from '@/lib/formato';
import { mensajeDeError, supabase } from '@/lib/supabase';
import { colores } from '@/theme/colores';

type Comentario = {
  id: string;
  negocio: string;
  perfil: string | null;
  version: string | null;
  texto: string;
  leido: boolean;
  creado_en: string;
};
type ErrorApp = {
  id: string;
  negocio: string | null;
  version: string | null;
  dispositivo: string | null;
  mensaje: string;
  detalle: string | null;
  creado_en: string;
};

/** Comentarios y errores enviados desde las apps de los clientes (solo administrador). */
export default function ReportesScreen() {
  const [vista, setVista] = useState<'comentarios' | 'errores'>('comentarios');
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [errores, setErrores] = useState<ErrorApp[]>([]);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const obtener = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_listar_reportes', { p_limite: 100 });
    return e
      ? { error: mensajeDeError(e), comentarios: [], errores: [] }
      : { error: null, ...(data as { comentarios: Comentario[]; errores: ErrorApp[] }) };
  }, []);

  const aplicar = useCallback((d: Awaited<ReturnType<typeof obtener>>) => {
    setError(d.error);
    setComentarios(d.comentarios);
    setErrores(d.errores);
  }, []);

  useEffect(() => {
    obtener().then(aplicar);
  }, [obtener, aplicar]);

  const marcar = async (c: Comentario) => {
    await supabase.rpc('admin_marcar_comentario', { p_id: c.id, p_leido: !c.leido });
    obtener().then(aplicar);
  };

  const sinLeer = comentarios.filter((c) => !c.leido).length;

  return (
    <Formulario titulo="Reportes" error={error}>
      <Selector
        opciones={[
          {
            valor: 'comentarios' as const,
            etiqueta: `Comentarios${sinLeer ? ` (${sinLeer})` : ''}`,
          },
          { valor: 'errores' as const, etiqueta: `Errores (${errores.length})` },
        ]}
        valor={vista}
        onCambio={setVista}
      />
      <View style={estilos.espacio} />

      {vista === 'comentarios'
        ? comentarios.map((c) => (
            <View key={c.id} style={[estilos.tarjeta, !c.leido && estilos.nuevo]}>
              <Text style={estilos.titulo}>{c.negocio}</Text>
              <Text style={estilos.nota}>
                {formatearFechaHora(new Date(c.creado_en))}
                {c.perfil ? ` · ${c.perfil}` : ''}
                {c.version ? ` · v${c.version}` : ''}
              </Text>
              <Text style={estilos.texto}>{c.texto}</Text>
              <Text accessibilityRole="button" style={estilos.enlace} onPress={() => marcar(c)}>
                {c.leido ? 'Marcar como no leído' : 'Marcar como leído'}
              </Text>
            </View>
          ))
        : errores.map((e) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => setAbierto(abierto === e.id ? null : e.id)}
              style={estilos.tarjeta}
            >
              <Text style={estilos.titulo}>{e.mensaje}</Text>
              <Text style={estilos.nota}>
                {formatearFechaHora(new Date(e.creado_en))} · {e.negocio ?? 'Sin negocio'}
                {e.version ? ` · v${e.version}` : ''}
                {e.dispositivo ? ` · ${e.dispositivo}` : ''}
              </Text>
              {abierto === e.id && e.detalle ? (
                <Text style={estilos.detalle}>{e.detalle}</Text>
              ) : null}
            </Pressable>
          ))}

      {(vista === 'comentarios' ? comentarios : errores).length === 0 ? (
        <Text style={estilos.nota}>No hay {vista} todavía.</Text>
      ) : null}
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  espacio: { height: 12 },
  tarjeta: {
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  nuevo: { borderColor: colores.primario, borderWidth: 2 },
  titulo: { fontSize: 15, fontWeight: '600', color: colores.texto },
  nota: { marginTop: 2, fontSize: 12, color: colores.textoSecundario },
  texto: { marginTop: 8, fontSize: 15, color: colores.texto },
  detalle: { marginTop: 8, fontSize: 11, fontFamily: 'monospace', color: colores.textoSecundario },
  enlace: { marginTop: 8, fontSize: 14, color: colores.primario },
});
