import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSesion } from '@/sesion/store';

import { sincronizarAhora } from './ejecutar';

const INTERVALO_MS = 60 * 1000;

/** Sincroniza al abrir la app, al volver a primer plano y cada minuto. */
export function useSincronizacionAutomatica() {
  const db = useSQLiteContext();
  const negocioId = useSesion((s) => s.negocioId);

  useEffect(() => {
    if (!negocioId) return;

    sincronizarAhora(db);
    const intervalo = setInterval(() => sincronizarAhora(db), INTERVALO_MS);
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sincronizarAhora(db);
    });

    return () => {
      clearInterval(intervalo);
      suscripcion.remove();
    };
  }, [db, negocioId]);
}
