import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import { useBase } from '@/db/proveedor';
import { contarPersonasPorRol, listarRoles, type Rol } from '@/db/roles';
import { editorDe, puedeEditarRol, resumirPermisos } from '@/features/permisos/edicionRoles';
import { usePermiso, usePermisos } from '@/sesion/permisos';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

const textoPersonas = (n: number) =>
  n === 0 ? 'Sin personas' : n === 1 ? '1 persona' : `${n} personas`;

/** Roles del negocio con cuántas personas tiene cada uno (permiso "usuarios"). */
export default function RolesScreen() {
  const db = useBase();
  const { negocioId, perfil, versionDatos } = useSesion();
  const puedeAdministrar = usePermiso('usuarios');
  const permisos = usePermisos();
  const [roles, setRoles] = useState<Rol[]>([]);
  const [personas, setPersonas] = useState<Record<string, number>>({});

  const recargar = useCallback(() => {
    if (!negocioId) return;
    listarRoles(db, negocioId).then(setRoles);
    contarPersonasPorRol(db, negocioId).then(setPersonas);
  }, [db, negocioId]);

  useEffect(recargar, [recargar, versionDatos]);

  if (!puedeAdministrar || !perfil) {
    return (
      <Formulario titulo="Roles" error="No tienes permiso para administrar roles.">
        <View />
      </Formulario>
    );
  }

  const editor = editorDe(perfil, roles, permisos);

  return (
    <Formulario
      titulo="Roles"
      subtitulo="Cada rol define qué puede hacer quien lo tiene. Toca un rol para ver o cambiar sus permisos."
    >
      {roles.length === 0 ? (
        <Text style={estilos.nota}>Los roles llegan al sincronizar con internet.</Text>
      ) : null}
      {roles.map((rol) => {
        const { editable } = puedeEditarRol(rol, editor);
        return (
          <Pressable
            key={rol.id}
            accessibilityRole="button"
            accessibilityLabel={`Rol ${rol.nombre}`}
            style={estilos.tarjeta}
            onPress={() => router.push({ pathname: '/rol/[id]', params: { id: rol.id } })}
          >
            <Text style={estilos.nombre}>{rol.nombre}</Text>
            <Text style={estilos.detalle}>
              {textoPersonas(personas[rol.id] ?? 0)}
              {rol.predefinido ? ' · Predefinido' : ''}
              {editable ? '' : ' · Solo ver'}
            </Text>
            <Text style={estilos.permisos}>{resumirPermisos(rol)}</Text>
          </Pressable>
        );
      })}
      <Boton
        titulo="Nuevo rol"
        onPress={() => router.push({ pathname: '/rol/[id]', params: { id: 'nuevo' } })}
      />
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    padding: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  nombre: { fontSize: 18, fontWeight: '600', color: colores.texto },
  detalle: { marginTop: 2, fontSize: 14, color: colores.textoSecundario },
  permisos: { marginTop: 6, fontSize: 13, color: colores.textoSecundario },
  nota: { marginBottom: 12, fontSize: 15, color: colores.textoSecundario },
});
