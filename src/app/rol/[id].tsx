import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { useBase } from '@/db/proveedor';
import {
  actualizarRol,
  contarPersonasPorRol,
  crearRol,
  eliminarRol,
  listarRoles,
  obtenerRol,
  type Rol,
} from '@/db/roles';
import { GRUPOS_PERMISOS, type Permiso, ROLES_PREDEFINIDOS } from '@/features/permisos/catalogo';
import {
  editorDe,
  LARGO_MAXIMO_NOMBRE_ROL,
  permisoEditable,
  puedeEditarRol,
  puedeRestablecer,
} from '@/features/permisos/edicionRoles';
import { avisar } from '@/lib/dialogo';
import { usePermiso, usePermisos } from '@/sesion/permisos';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

type Borrador = { nombre: string; permisos: Permiso[] };

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : 'No se pudo guardar el rol.');

/**
 * Nombre y permisos de un rol ("nuevo" para crear uno). Solo se activan los permisos
 * que tiene quien edita, y nadie salvo el dueño cambia su propio rol.
 */
export default function RolScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useBase();
  const { negocioId, perfil, versionDatos, datosCambiaron } = useSesion();
  const puedeAdministrar = usePermiso('usuarios');
  const permisosPropios = usePermisos();
  const nuevo = id === 'nuevo';

  const [rol, setRol] = useState<Rol | null | undefined>(nuevo ? null : undefined);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [personas, setPersonas] = useState(0);
  const [borrador, setBorrador] = useState<Borrador | null>(
    nuevo ? { nombre: '', permisos: [] } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(() => {
    if (!negocioId) return;
    listarRoles(db, negocioId).then(setRoles);
    if (nuevo || !id) return;
    obtenerRol(db, id).then((r) => {
      setRol(r);
      // El borrador se arma una vez: una sincronización no borra lo que se está editando.
      setBorrador((b) => b ?? (r ? { nombre: r.nombre, permisos: r.permisos } : null));
    });
    contarPersonasPorRol(db, negocioId).then((c) => setPersonas(c[id] ?? 0));
  }, [db, negocioId, id, nuevo]);

  useEffect(recargar, [recargar, versionDatos]);

  if (!puedeAdministrar || !perfil) {
    return (
      <Formulario titulo="Rol" error="No tienes permiso para administrar roles.">
        <View />
      </Formulario>
    );
  }
  if (rol === undefined) return null;
  if (!nuevo && (!rol || rol.eliminado || rol.negocio_id !== negocioId)) {
    return (
      <Formulario titulo="Rol" error="Este rol ya no existe.">
        <View />
      </Formulario>
    );
  }
  if (!borrador) return null;

  const editor = editorDe(perfil, roles, permisosPropios);
  const { editable, motivo } = rol ? puedeEditarRol(rol, editor) : { editable: true };
  const predefinido = rol?.predefinido ?? null;
  const limitado = !editor.esDueno;

  const cambiarPermiso = (permiso: Permiso, activo: boolean) =>
    setBorrador(
      (b) =>
        b && {
          ...b,
          permisos: activo ? [...b.permisos, permiso] : b.permisos.filter((p) => p !== permiso),
        },
    );

  const despuesDeCambiar = () => {
    datosCambiaron();
    sincronizarAhora(db);
  };

  const guardar = async () => {
    // Por si el rol cambió al sincronizar: no se guardan permisos que quien edita no tiene.
    if (borrador.permisos.some((p) => !permisoEditable(p, editor))) {
      return setError('Solo puedes dar permisos que tú tienes.');
    }
    setGuardando(true);
    try {
      if (nuevo) {
        const creado = await crearRol(db, {
          negocioId: negocioId!,
          nombre: borrador.nombre,
          permisos: borrador.permisos,
        });
        despuesDeCambiar();
        router.replace({ pathname: '/rol/[id]', params: { id: creado.id } });
      } else {
        await actualizarRol(db, rol!.id, {
          nombre: predefinido ? undefined : borrador.nombre,
          permisos: borrador.permisos,
        });
        setError(null);
        despuesDeCambiar();
        avisar('Rol guardado', 'Los cambios llegan a los demás equipos al sincronizar.');
      }
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  const restablecer = () => {
    if (!predefinido) return;
    const fabrica = ROLES_PREDEFINIDOS[predefinido];
    avisar('Restablecer rol', `${fabrica.nombre} vuelve a sus permisos de siempre.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restablecer',
        onPress: () => setBorrador({ nombre: borrador.nombre, permisos: [...fabrica.permisos] }),
      },
    ]);
  };

  const eliminar = () =>
    avisar('Eliminar rol', `¿Eliminar el rol ${rol!.nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await eliminarRol(db, rol!.id);
            despuesDeCambiar();
            router.back();
          } catch (e) {
            setError(mensajeDe(e));
          }
        },
      },
    ]);

  return (
    <Formulario
      titulo={nuevo ? 'Nuevo rol' : rol!.nombre}
      subtitulo={
        rol ? `${personas === 1 ? '1 persona' : `${personas} personas`} con este rol` : undefined
      }
      error={error ?? (editable ? null : (motivo ?? null))}
    >
      <Campo
        etiqueta="Nombre"
        value={borrador.nombre}
        maxLength={LARGO_MAXIMO_NOMBRE_ROL}
        editable={editable && !predefinido}
        ayuda={predefinido ? 'Los roles predefinidos no se pueden renombrar.' : undefined}
        onChangeText={(nombre) => setBorrador({ ...borrador, nombre })}
      />
      {editable && limitado ? (
        <Text style={estilos.nota}>Solo puedes dar permisos que tú tienes.</Text>
      ) : null}

      {GRUPOS_PERMISOS.map((grupo) => (
        <View key={grupo.titulo}>
          <Text style={estilos.seccion}>{grupo.titulo}</Text>
          {grupo.permisos.map(({ clave, texto, detalle }) => {
            const activo = borrador.permisos.includes(clave);
            const habilitado = editable && permisoEditable(clave, editor);
            return (
              <Pressable
                key={clave}
                disabled={!habilitado}
                style={[estilos.permiso, !habilitado && estilos.deshabilitado]}
                onPress={() => cambiarPermiso(clave, !activo)}
              >
                <View style={estilos.textos}>
                  <Text style={estilos.texto}>{texto}</Text>
                  <Text style={estilos.detalle}>{detalle}</Text>
                </View>
                <Switch
                  accessibilityLabel={texto}
                  value={activo}
                  disabled={!habilitado}
                  onValueChange={(v) => cambiarPermiso(clave, v)}
                />
              </Pressable>
            );
          })}
        </View>
      ))}

      {borrador.permisos.includes('usuarios') && editable ? (
        <Text style={estilos.aviso}>Quien tenga este rol podrá cambiar roles y personas.</Text>
      ) : null}

      {editable ? (
        <View style={estilos.acciones}>
          <Boton titulo={nuevo ? 'Crear rol' : 'Guardar'} cargando={guardando} onPress={guardar} />
          {rol && puedeRestablecer(rol, editor) ? (
            <Boton titulo="Restablecer" variante="secundario" onPress={restablecer} />
          ) : null}
          {rol && !predefinido && personas === 0 ? (
            <Boton titulo="Eliminar rol" variante="peligro" onPress={eliminar} />
          ) : null}
          {rol && !predefinido && personas > 0 ? (
            <Text style={estilos.nota}>
              Para eliminar este rol, primero cambia de rol a sus personas.
            </Text>
          ) : null}
        </View>
      ) : null}
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  seccion: {
    marginTop: 20,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
  permiso: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  deshabilitado: { opacity: 0.5 },
  textos: { flex: 1, marginRight: 12 },
  texto: { fontSize: 17, fontWeight: '600', color: colores.texto },
  detalle: { marginTop: 2, fontSize: 14, color: colores.textoSecundario },
  nota: { marginTop: 8, fontSize: 14, color: colores.textoSecundario },
  aviso: { marginTop: 12, fontSize: 15, fontWeight: '600', color: colores.error },
  acciones: { marginTop: 20, gap: 12 },
});
