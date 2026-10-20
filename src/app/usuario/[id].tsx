import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import {
  cambiarActivo,
  cambiarNombre,
  cambiarPermisos,
  cambiarPin,
  crearPerfil,
  obtenerPerfil,
  type Perfil,
} from '@/db/perfiles';
import { useBase } from '@/db/proveedor';
import { GRUPOS_PERMISOS, type Permiso } from '@/features/permisos/catalogo';
import {
  type Editor,
  LARGO_MAXIMO_NOMBRE,
  normalizarNombre,
  ordenarPermisos,
  permisoEditable,
  permisosInicialesPara,
  puedeEditarPersona,
  validarNombre,
  validarPermisos,
} from '@/features/permisos/edicionPersonas';
import { avisar } from '@/lib/dialogo';
import { esPinValido, LARGO_PIN } from '@/lib/pin';
import { usePermiso, usePermisos } from '@/sesion/permisos';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

type Datos = { nombre: string; activo: boolean; permisos: Permiso[] };
/** Lo que se edita, y con qué valores se abrió: al guardar solo se manda lo que cambió. */
type Borrador = Datos & { pin: string; inicial: Datos };

const borradorDe = (datos: Datos): Borrador => ({ ...datos, pin: '', inicial: datos });

const soloNumeros = (v: string) => v.replace(/\D/g, '').slice(0, LARGO_PIN);

/**
 * Datos y permisos de una persona ("nuevo" para agregar una). Solo se activan los permisos
 * que tiene quien edita; nadie cambia los suyos ni toca al dueño (edicionPersonas.ts).
 */
export default function UsuarioScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useBase();
  const { negocioId, perfil: actual, versionDatos, datosCambiaron } = useSesion();
  const puedeAdministrar = usePermiso('usuarios');
  const permisosPropios = usePermisos();
  const nuevo = id === 'nuevo';

  const [persona, setPersona] = useState<Perfil | null | undefined>(nuevo ? null : undefined);
  const editor: Editor | null = actual
    ? { esDueno: actual.rol === 'dueno', perfilId: actual.id, permisos: permisosPropios }
    : null;

  // Una persona nueva parte con los permisos iniciales que quien la agrega puede dar.
  const [borrador, setBorrador] = useState<Borrador | null>(() =>
    nuevo && editor
      ? borradorDe({ nombre: '', activo: true, permisos: permisosInicialesPara(editor) })
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const recargar = useCallback(() => {
    if (nuevo || !id) return;
    obtenerPerfil(db, id).then((p) => {
      setPersona(p);
      // El borrador se arma una vez: una sincronización no borra lo que se está editando.
      setBorrador(
        (b) => b ?? (p && borradorDe({ nombre: p.nombre, activo: p.activo, permisos: p.permisos })),
      );
    });
  }, [db, id, nuevo]);

  useEffect(recargar, [recargar, versionDatos]);

  if (!puedeAdministrar || !editor) {
    return (
      <Formulario titulo="Persona" error="No tienes permiso para administrar usuarios.">
        <View />
      </Formulario>
    );
  }
  if (persona === undefined) return null;
  if (!nuevo && (!persona || persona.negocio_id !== negocioId)) {
    return (
      <Formulario titulo="Persona" error="Esta persona ya no existe.">
        <View />
      </Formulario>
    );
  }
  if (!borrador) return null;

  const esDueno = persona?.rol === 'dueno';
  const edicion = persona
    ? puedeEditarPersona(persona, editor)
    : { nombre: true, pin: true, activo: false, permisos: true };
  const puedeGuardar = edicion.nombre || edicion.pin || edicion.activo || edicion.permisos;

  const cambiarPermiso = (permiso: Permiso, activo: boolean) =>
    setBorrador(
      (b) =>
        b && {
          ...b,
          permisos: activo ? [...b.permisos, permiso] : b.permisos.filter((p) => p !== permiso),
        },
    );

  const guardar = async () => {
    const errorNombre = edicion.nombre ? validarNombre(borrador.nombre) : null;
    if (errorNombre) return setError(errorNombre);
    if ((nuevo || borrador.pin) && !esPinValido(borrador.pin)) {
      return setError(`El PIN debe tener ${LARGO_PIN} números.`);
    }
    // Por si los permisos de quien edita cambiaron al sincronizar.
    const permisos = ordenarPermisos(borrador.permisos);
    const errorPermisos = edicion.permisos ? validarPermisos(permisos, editor) : null;
    if (errorPermisos) return setError(errorPermisos);

    setGuardando(true);
    try {
      // Con los datos de ahora (otro equipo pudo cambiarlos mientras se editaba).
      const fresca = nuevo ? null : await obtenerPerfil(db, persona!.id);
      if (!nuevo && !fresca) return setError('Esta persona ya no existe.');
      const permitido = fresca ? puedeEditarPersona(fresca, editor) : edicion;
      const { inicial } = borrador;
      const nombreNuevo = normalizarNombre(borrador.nombre);
      const cambia = {
        nombre: permitido.nombre && nombreNuevo !== normalizarNombre(inicial.nombre),
        pin: permitido.pin && !!borrador.pin,
        activo: permitido.activo && borrador.activo !== inicial.activo,
        permisos:
          permitido.permisos && permisos.join() !== ordenarPermisos(inicial.permisos).join(),
      };
      const tocados =
        borrador.pin !== '' ||
        nombreNuevo !== normalizarNombre(inicial.nombre) ||
        borrador.activo !== inicial.activo ||
        permisos.join() !== ordenarPermisos(inicial.permisos).join();
      if (!nuevo && tocados && !Object.values(cambia).some(Boolean)) {
        return setError(permitido.motivo ?? 'Ya no puedes cambiar a esta persona.');
      }

      if (nuevo) {
        await crearPerfil(db, {
          negocioId: negocioId!,
          nombre: borrador.nombre,
          rol: 'cajero',
          pin: borrador.pin,
          permisos,
        });
      } else {
        // Solo lo que se tocó: así no se deshace lo que otro equipo cambió mientras tanto.
        const id = fresca!.id;
        await db.withTransactionAsync(async () => {
          if (cambia.nombre) await cambiarNombre(db, id, nombreNuevo);
          if (cambia.pin) await cambiarPin(db, id, borrador.pin);
          if (cambia.activo) await cambiarActivo(db, id, borrador.activo);
          if (cambia.permisos) await cambiarPermisos(db, id, permisos);
        });
      }
      datosCambiaron();
      sincronizarAhora(db);
      if (nuevo) {
        router.back();
      } else {
        setError(null);
        const guardado = await obtenerPerfil(db, fresca!.id);
        if (guardado) {
          setPersona(guardado);
          setBorrador(
            borradorDe({
              nombre: guardado.nombre,
              activo: guardado.activo,
              permisos: guardado.permisos,
            }),
          );
        }
        avisar('Cambios guardados', 'Llegan a los demás equipos al sincronizar.');
      }
    } catch {
      setError('No se pudieron guardar los cambios. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Formulario
      titulo={nuevo ? 'Nueva persona' : persona!.nombre}
      subtitulo={esDueno ? 'Dueño: tiene todos los permisos.' : undefined}
      error={error}
    >
      {edicion.motivo ? <Text style={estilos.nota}>{edicion.motivo}</Text> : null}
      <Campo
        etiqueta="Nombre"
        value={borrador.nombre}
        maxLength={LARGO_MAXIMO_NOMBRE}
        editable={edicion.nombre}
        onChangeText={(nombre) => setBorrador({ ...borrador, nombre })}
      />
      {edicion.pin ? (
        <Campo
          etiqueta={
            nuevo ? `PIN (${LARGO_PIN} números)` : 'PIN nuevo (déjalo vacío para no cambiarlo)'
          }
          keyboardType="number-pad"
          secureTextEntry
          maxLength={LARGO_PIN}
          value={borrador.pin}
          onChangeText={(v) => setBorrador({ ...borrador, pin: soloNumeros(v) })}
        />
      ) : null}

      {edicion.activo ? (
        <View style={estilos.permiso}>
          <View style={estilos.textos}>
            <Text style={estilos.texto}>Activo</Text>
            <Text style={estilos.detalle}>Si lo desactivas, no puede entrar con su PIN.</Text>
          </View>
          <Switch
            accessibilityLabel="Activo"
            value={borrador.activo}
            onValueChange={(activo) => setBorrador({ ...borrador, activo })}
          />
        </View>
      ) : null}

      {!esDueno ? (
        <>
          {edicion.permisos && !editor.esDueno ? (
            <Text style={estilos.nota}>Solo puedes dar permisos que tú tienes.</Text>
          ) : null}
          {GRUPOS_PERMISOS.map((grupo) => (
            <View key={grupo.titulo}>
              <Text style={estilos.seccion}>{grupo.titulo}</Text>
              {grupo.permisos.map(({ clave, texto, detalle }) => {
                const activo = borrador.permisos.includes(clave);
                const habilitado = edicion.permisos && permisoEditable(clave, editor);
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
          {borrador.permisos.includes('usuarios') && edicion.permisos ? (
            <Text style={estilos.aviso}>
              Con este permiso podrá agregar personas y cambiar sus permisos.
            </Text>
          ) : null}
        </>
      ) : null}

      {puedeGuardar ? (
        <View style={estilos.acciones}>
          <Boton
            titulo={nuevo ? 'Agregar persona' : 'Guardar'}
            cargando={guardando}
            onPress={guardar}
          />
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
