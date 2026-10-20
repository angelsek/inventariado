import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import { listarPerfiles, type Perfil } from '@/db/perfiles';
import { useBase } from '@/db/proveedor';
import { resumirPermisos } from '@/features/permisos/edicionPersonas';
import { etiquetaPersona, usePermiso } from '@/sesion/permisos';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

/**
 * Personas del negocio con lo que puede hacer cada una (permiso "usuarios"). Al tocar
 * una se abren sus datos y sus permisos (usuario/[id].tsx).
 */
export default function UsuariosScreen() {
  const db = useBase();
  const { negocioId, perfil: actual, versionDatos } = useSesion();
  const puedeAdministrar = usePermiso('usuarios');
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);

  const recargar = useCallback(() => {
    if (negocioId) listarPerfiles(db, negocioId).then(setPerfiles);
  }, [db, negocioId]);

  useEffect(recargar, [recargar, versionDatos]);

  if (!puedeAdministrar || !actual) {
    return (
      <Formulario titulo="Usuarios" error="No tienes permiso para administrar usuarios.">
        <View />
      </Formulario>
    );
  }

  const abrir = (id: string) => router.push({ pathname: '/usuario/[id]', params: { id } });

  return (
    <Formulario
      titulo="Usuarios y permisos"
      subtitulo="Cada persona entra con su PIN y solo ve lo que le permites. Los cambios llegan a todos los equipos del local."
    >
      {perfiles.map((p) => {
        const etiqueta = [
          etiquetaPersona(p),
          p.id === actual.id ? 'tú' : '',
          p.activo ? '' : 'desactivado',
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={`Editar a ${p.nombre}`}
            onPress={() => abrir(p.id)}
            style={({ pressed }) => [estilos.tarjeta, pressed && estilos.presionado]}
          >
            <View style={estilos.datos}>
              <Text style={estilos.nombre}>{p.nombre}</Text>
              {etiqueta ? <Text style={estilos.etiqueta}>{etiqueta}</Text> : null}
              <Text style={estilos.permisos}>{resumirPermisos(p)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colores.textoSecundario} />
          </Pressable>
        );
      })}

      <View style={estilos.acciones}>
        <Boton titulo="Nueva persona" onPress={() => abrir('nuevo')} />
      </View>
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  presionado: { opacity: 0.6 },
  datos: { flex: 1, marginRight: 8 },
  nombre: { fontSize: 17, fontWeight: '600', color: colores.texto },
  etiqueta: { fontSize: 14, color: colores.textoSecundario },
  permisos: { marginTop: 4, fontSize: 13, color: colores.textoSecundario },
  acciones: { marginTop: 8 },
});
