import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import type { Perfil } from '@/db/perfiles';
import { useBase } from '@/db/proveedor';
import { avisar } from '@/lib/dialogo';
import { esPinValido, LARGO_PIN } from '@/lib/pin';
import { mensajeDeError } from '@/lib/supabase';
import { asignarPersonaALocal, type Local, listarLocales } from '@/sesion/cuenta';
import { useSesion } from '@/sesion/store';
import { colores } from '@/theme/colores';

/**
 * El dueño elige en qué otros locales trabaja esta persona. En cada uno se crea su perfil con el
 * PIN que el dueño escribe (el PIN se guarda por local) y los mismos permisos que tiene aquí; después
 * se pueden cambiar en ese local. Requiere internet.
 */
export function AsignarALocales({ persona }: { persona: Perfil }) {
  const db = useBase();
  const { negocioId, perfil } = useSesion();
  const [locales, setLocales] = useState<Local[] | null>(null);
  const [pines, setPines] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!perfil) return;
    listarLocales(perfil)
      .then((l) => setLocales(l.filter((x) => x.id !== negocioId)))
      .catch(() => setError('No se pudieron cargar los locales. Revisa tu conexión.'));
  }, [perfil, negocioId]);

  const asignar = async (local: Local) => {
    const pin = pines[local.id] ?? '';
    if (!esPinValido(pin)) return setError(`El PIN debe tener ${LARGO_PIN} números.`);
    setOcupado(local.id);
    setError(null);
    try {
      await asignarPersonaALocal(db, {
        perfilId: persona.id,
        nombre: persona.nombre,
        negocioDestino: local.id,
        pin,
        permisos: persona.permisos,
      });
      setPines((p) => ({ ...p, [local.id]: '' }));
      avisar('Listo', `${persona.nombre} ya puede entrar a «${local.nombre}» con ese PIN.`);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(null);
    }
  };

  if (!locales || locales.length === 0) return null;

  return (
    <View style={estilos.bloque}>
      <Text style={estilos.seccion}>Trabaja en otros locales</Text>
      <Text style={estilos.detalle}>
        Escribe el PIN que usará en cada local. Puede ser el mismo que aquí.
      </Text>
      {error ? <Text style={estilos.error}>{error}</Text> : null}
      {locales.map((local) => (
        <View key={local.id} style={estilos.local}>
          <Text style={estilos.nombre}>{local.nombre}</Text>
          <Campo
            etiqueta={`PIN en este local (${LARGO_PIN} números)`}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={LARGO_PIN}
            value={pines[local.id] ?? ''}
            onChangeText={(v) =>
              setPines((p) => ({ ...p, [local.id]: v.replace(/\D/g, '').slice(0, LARGO_PIN) }))
            }
          />
          <Boton
            titulo="Asignar a este local"
            variante="secundario"
            cargando={ocupado === local.id}
            onPress={() => asignar(local)}
          />
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  bloque: { marginTop: 20 },
  seccion: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: colores.textoSecundario,
  },
  detalle: { marginBottom: 8, fontSize: 14, color: colores.textoSecundario },
  error: { marginBottom: 8, fontSize: 15, color: colores.error },
  local: {
    gap: 8,
    padding: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  nombre: { fontSize: 17, fontWeight: '600', color: colores.texto },
});
