import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { Hoja } from '@/components/Hoja';
import {
  eliminarProveedor,
  guardarProveedor,
  listarProveedores,
  type Proveedor,
} from '@/db/proveedores';
import { esRutValido, formatearRut } from '@/lib/validacion';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';

type Edicion = { id?: string; nombre: string; rut: string; telefono: string };

export default function ProveedoresScreen() {
  const db = useSQLiteContext();
  const { negocioId, versionDatos, datosCambiaron } = useSesion();
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(() => {
    if (negocioId) listarProveedores(db, negocioId).then(setProveedores);
  }, [db, negocioId]);
  useEffect(recargar, [recargar, versionDatos]);

  const listo = () => {
    datosCambiaron();
    sincronizarAhora(db);
  };

  const guardar = async () => {
    if (!edicion?.nombre.trim()) return setError('Ingresa el nombre.');
    if (edicion.rut.trim() && !esRutValido(edicion.rut)) return setError('El RUT no es válido.');
    await guardarProveedor(db, negocioId!, edicion);
    setEdicion(null);
    setError(null);
    listo();
  };

  const eliminar = (p: Proveedor) =>
    Alert.alert(
      'Eliminar proveedor',
      `¿Eliminar "${p.nombre}"? Sus ingresos anteriores se mantienen.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await eliminarProveedor(db, p.id);
            listo();
          },
        },
      ],
    );

  return (
    <Formulario titulo="Proveedores">
      {proveedores.map((p) => (
        <Pressable
          key={p.id}
          accessibilityRole="button"
          onPress={() =>
            setEdicion({ id: p.id, nombre: p.nombre, rut: p.rut ?? '', telefono: p.telefono ?? '' })
          }
          onLongPress={() => eliminar(p)}
          style={estilos.tarjeta}
        >
          <Text style={estilos.nombre}>{p.nombre}</Text>
          <Text style={estilos.nota}>
            {[p.rut, p.telefono].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
          </Text>
        </Pressable>
      ))}
      {proveedores.length ? (
        <Text style={estilos.nota}>Mantén presionado un proveedor para eliminarlo.</Text>
      ) : null}
      <Boton
        titulo="Nuevo proveedor"
        onPress={() => setEdicion({ nombre: '', rut: '', telefono: '' })}
      />

      <Hoja
        visible={!!edicion}
        titulo={edicion?.id ? 'Editar proveedor' : 'Nuevo proveedor'}
        onCerrar={() => {
          setEdicion(null);
          setError(null);
        }}
      >
        {error ? <Text style={estilos.error}>{error}</Text> : null}
        <Campo
          etiqueta="Nombre"
          value={edicion?.nombre ?? ''}
          onChangeText={(nombre) => setEdicion((e) => e && { ...e, nombre })}
        />
        <Campo
          etiqueta="RUT (opcional)"
          value={edicion?.rut ?? ''}
          onChangeText={(rut) => setEdicion((e) => e && { ...e, rut })}
          onBlur={() => setEdicion((e) => e && { ...e, rut: e.rut ? formatearRut(e.rut) : '' })}
        />
        <Campo
          etiqueta="Teléfono (opcional)"
          keyboardType="phone-pad"
          value={edicion?.telefono ?? ''}
          onChangeText={(telefono) => setEdicion((e) => e && { ...e, telefono })}
        />
        <Boton titulo="Guardar" onPress={guardar} />
      </Hoja>
    </Formulario>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    padding: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  nombre: { fontSize: 16, fontWeight: '600', color: colores.texto },
  nota: { marginBottom: 12, fontSize: 13, color: colores.textoSecundario },
  error: { marginBottom: 12, color: colores.error },
});
