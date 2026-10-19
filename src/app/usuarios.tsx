import { useBase } from '@/db/proveedor';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { Selector } from '@/components/Selector';
import {
  asignarRol,
  cambiarActivo,
  cambiarPin,
  crearPerfil,
  listarPerfiles,
  type Perfil,
} from '@/db/perfiles';
import { listarRoles, type Rol } from '@/db/roles';
import { GRUPOS_PERMISOS } from '@/features/permisos/catalogo';
import { esPinValido, LARGO_PIN } from '@/lib/pin';
import { usePermiso } from '@/sesion/permisos';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

/** Textos de los permisos de un rol, para que el dueño vea qué puede hacer cada uno. */
const resumirPermisos = (rol: Rol) =>
  GRUPOS_PERMISOS.flatMap((g) => g.permisos)
    .filter((p) => rol.permisos.includes(p.clave))
    .map((p) => p.texto)
    .join(' · ') || 'Solo ver productos';

/**
 * Personas del negocio y su rol (permiso "usuarios"). Nadie más que el dueño toca el
 * perfil del dueño, y nadie cambia su propio rol ni se desactiva a sí mismo.
 */
export default function UsuariosScreen() {
  const db = useBase();
  const { negocioId, perfil: actual, versionDatos, datosCambiaron } = useSesion();
  const puedeAdministrar = usePermiso('usuarios');
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [nombre, setNombre] = useState('');
  const [pin, setPin] = useState('');
  const [rolNuevo, setRolNuevo] = useState<string | null>(null);
  const [editandoPin, setEditandoPin] = useState<string | null>(null);
  const [pinNuevo, setPinNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(() => {
    if (!negocioId) return;
    listarPerfiles(db, negocioId).then(setPerfiles);
    listarRoles(db, negocioId).then(setRoles);
  }, [db, negocioId]);

  useEffect(recargar, [recargar, versionDatos]);

  const despuesDeCambiar = () => {
    datosCambiaron();
    sincronizarAhora(db);
  };

  if (!puedeAdministrar || !actual) {
    return (
      <Formulario titulo="Usuarios" error="No tienes permiso para administrar usuarios.">
        <View />
      </Formulario>
    );
  }

  const cajero = roles.find((r) => r.predefinido === 'cajero');
  const rolElegido = rolNuevo ?? cajero?.id ?? null;
  const opcionesRol = roles.map((r) => ({ valor: r.id, etiqueta: r.nombre }));
  const nombreRol = (p: Perfil) =>
    p.rol === 'dueno' ? 'Dueño' : (roles.find((r) => r.id === p.rol_id)?.nombre ?? 'Cajero');

  const agregar = async () => {
    if (!nombre.trim()) return setError('Ingresa el nombre de la persona.');
    if (!esPinValido(pin)) return setError(`El PIN debe tener ${LARGO_PIN} números.`);
    setError(null);
    await crearPerfil(db, {
      negocioId: negocioId!,
      nombre,
      rol: 'cajero',
      rolId: rolElegido,
      pin,
    });
    setNombre('');
    setPin('');
    setRolNuevo(null);
    despuesDeCambiar();
  };

  const guardarPin = async (perfilId: string) => {
    if (!esPinValido(pinNuevo)) return setError(`El PIN debe tener ${LARGO_PIN} números.`);
    setError(null);
    await cambiarPin(db, perfilId, pinNuevo);
    setEditandoPin(null);
    setPinNuevo('');
    despuesDeCambiar();
  };

  const soloNumeros = (v: string) => v.replace(/\D/g, '').slice(0, LARGO_PIN);
  const rolDe = (id: string | null) => roles.find((r) => r.id === id);

  return (
    <Formulario
      titulo="Usuarios y permisos"
      subtitulo="Cada persona entra con su PIN y solo ve lo que permite su rol. Los cambios llegan a todos los equipos del local."
      error={error}
    >
      {perfiles.map((p) => {
        const esDueno = p.rol === 'dueno';
        const esYo = p.id === actual.id;
        // El perfil del dueño solo lo toca el dueño; el rol y el estado propios no se cambian.
        const puedeTocar = !esDueno || actual.rol === 'dueno';
        const puedeCambiarRol = !esDueno && !esYo;
        return (
          <View key={p.id} style={estilos.tarjeta}>
            <View style={estilos.fila}>
              <View style={estilos.datos}>
                <Text style={estilos.nombre}>{p.nombre}</Text>
                <Text style={estilos.rol}>
                  {nombreRol(p)}
                  {esYo ? ' · tú' : ''}
                  {p.activo ? '' : ' · desactivado'}
                </Text>
              </View>
              {puedeCambiarRol ? (
                <Switch
                  accessibilityLabel={`Activo: ${p.nombre}`}
                  value={p.activo}
                  onValueChange={async (activo) => {
                    await cambiarActivo(db, p.id, activo);
                    despuesDeCambiar();
                  }}
                />
              ) : null}
            </View>
            {puedeCambiarRol && opcionesRol.length > 0 ? (
              <View style={estilos.editar}>
                <Selector
                  horizontal
                  opciones={opcionesRol}
                  valor={p.rol_id ?? cajero?.id ?? ''}
                  onCambio={async (rolId) => {
                    await asignarRol(db, p.id, rolId);
                    despuesDeCambiar();
                  }}
                />
                {rolDe(p.rol_id ?? cajero?.id ?? null) ? (
                  <Text style={estilos.permisos}>
                    {resumirPermisos(rolDe(p.rol_id ?? cajero?.id ?? null)!)}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {!puedeTocar ? null : editandoPin === p.id ? (
              <View style={estilos.editar}>
                <Campo
                  etiqueta="PIN nuevo"
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={LARGO_PIN}
                  value={pinNuevo}
                  onChangeText={(v) => setPinNuevo(soloNumeros(v))}
                />
                <Boton titulo="Guardar PIN" onPress={() => guardarPin(p.id)} />
              </View>
            ) : (
              <Text
                accessibilityRole="button"
                style={estilos.enlace}
                onPress={() => {
                  setEditandoPin(p.id);
                  setPinNuevo('');
                }}
              >
                Cambiar PIN
              </Text>
            )}
          </View>
        );
      })}

      <Text style={estilos.seccion}>Nueva persona</Text>
      <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} />
      <Campo
        etiqueta={`PIN (${LARGO_PIN} números)`}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={LARGO_PIN}
        value={pin}
        onChangeText={(v) => setPin(soloNumeros(v))}
      />
      {opcionesRol.length > 0 && rolElegido ? (
        <>
          <Text style={estilos.etiqueta}>Rol</Text>
          <Selector horizontal opciones={opcionesRol} valor={rolElegido} onCambio={setRolNuevo} />
          {rolDe(rolElegido) ? (
            <Text style={estilos.permisos}>{resumirPermisos(rolDe(rolElegido)!)}</Text>
          ) : null}
        </>
      ) : (
        <Text style={estilos.permisos}>
          Los roles llegan al sincronizar con internet. Mientras tanto, la persona queda como
          Cajero.
        </Text>
      )}
      <Boton titulo="Agregar persona" onPress={agregar} />
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
  fila: { flexDirection: 'row', alignItems: 'center' },
  datos: { flex: 1 },
  nombre: { fontSize: 17, fontWeight: '600', color: colores.texto },
  rol: { fontSize: 14, color: colores.textoSecundario },
  permisos: { marginTop: 4, marginBottom: 8, fontSize: 13, color: colores.textoSecundario },
  enlace: { marginTop: 8, fontSize: 15, color: colores.primario },
  editar: { marginTop: 12 },
  etiqueta: { marginTop: 4, fontSize: 15, fontWeight: '600', color: colores.texto },
  seccion: {
    marginTop: 16,
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
});
