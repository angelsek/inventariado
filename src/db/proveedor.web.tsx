import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { colores, radios } from '@/theme/colores';
import { crearBloqueoPestana } from '@/web/plataforma/bloqueoPestana';

import { migrarBaseDeDatos, NOMBRE_BASE_DE_DATOS } from './migraciones';
import type { BaseLocal } from './tipos';

const ContextoBase = createContext<BaseLocal | null>(null);

// Marca que deja una pestaña que cedió la base, para no volver a pedirla al recargarse.
const CEDIDA = 'stockeao-pestana-cedida';

const bloqueo =
  typeof navigator !== 'undefined' && 'locks' in navigator
    ? crearBloqueoPestana({
        locks: navigator.locks,
        crearCanal: (nombre) => new BroadcastChannel(nombre),
      })
    : null;

/** La otra pestaña acaba de soltar el archivo: se reintenta un momento si aún no está libre. */
async function abrirConReintentos(): Promise<SQLiteDatabase> {
  for (let intento = 1; ; intento++) {
    try {
      return await openDatabaseAsync(NOMBRE_BASE_DE_DATOS);
    } catch (error) {
      if (intento >= 10) throw error;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}

/** Otra pestaña pidió la base: esta se recarga sin ella, lo que cierra su conexión. */
function cederPestana() {
  sessionStorage.setItem(CEDIDA, '1');
  location.reload();
}

type Estado = 'abriendo' | 'otraPestana' | 'lista' | 'error';

/**
 * Web (PC): la base es SQLite en el almacenamiento privado del sitio (OPFS), con la misma
 * API que en el teléfono. Solo una pestaña a la vez puede tenerla abierta.
 */
export function ProveedorBase({ children }: { children: ReactNode }) {
  // Una pestaña que acaba de ceder la base no la vuelve a pedir al recargarse.
  const [estado, setEstado] = useState<Estado>(() =>
    sessionStorage.getItem(CEDIDA) ? 'otraPestana' : 'abriendo',
  );
  const [base, setBase] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    try {
      const db = await abrirConReintentos();
      await migrarBaseDeDatos(db);
      setBase(db);
      setEstado('lista');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado('error');
    }
  };

  useEffect(() => {
    if (sessionStorage.getItem(CEDIDA)) {
      sessionStorage.removeItem(CEDIDA);
      return;
    }
    // Sin Web Locks (navegador antiguo) no hay bloqueo: se abre directamente.
    void (bloqueo ? bloqueo.tomar(cederPestana) : Promise.resolve(true)).then((tomada) => {
      if (tomada) void abrir();
      else setEstado('otraPestana');
    });
  }, []);

  if (estado === 'lista' && base) {
    return <ContextoBase.Provider value={base}>{children}</ContextoBase.Provider>;
  }
  if (estado === 'otraPestana') {
    return (
      <View style={estilos.centro}>
        <View style={estilos.tarjeta}>
          <Text style={estilos.titulo}>Stockeao ya está abierto en otra pestaña</Text>
          <Text style={estilos.texto}>
            Solo una pestaña puede usarlo a la vez. Si lo usas aquí, la otra pestaña se cierra: lo
            ya guardado se conserva, pero una venta que estaba a medio armar allá se pierde.
          </Text>
          <Boton
            titulo="Usar aquí"
            onPress={() => {
              setEstado('abriendo');
              void (bloqueo ? bloqueo.quitar(cederPestana) : Promise.resolve()).then(abrir);
            }}
          />
        </View>
      </View>
    );
  }
  if (estado === 'error') {
    return (
      <View style={estilos.centro}>
        <View style={estilos.tarjeta}>
          <Text style={estilos.titulo}>No se pudo abrir la base de datos</Text>
          <Text style={estilos.detalle}>{error}</Text>
          <Boton titulo="Reintentar" onPress={() => location.reload()} />
        </View>
      </View>
    );
  }
  return null;
}

export function useBase(): BaseLocal {
  const base = useContext(ContextoBase);
  if (!base) throw new Error('useBase debe usarse dentro de ProveedorBase.');
  return base;
}

const estilos = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colores.fondo,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 520,
    gap: 16,
    padding: 32,
    borderRadius: radios.grande,
    backgroundColor: colores.superficie,
  },
  titulo: { fontSize: 22, fontWeight: '700', color: colores.texto },
  texto: { fontSize: 16, lineHeight: 22, color: colores.textoSecundario },
  detalle: { fontSize: 14, color: colores.error },
});
