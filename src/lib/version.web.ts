import Constants from 'expo-constants';

/**
 * Web (PC): la versión es la de app.json y el número de build lo fija el workflow que
 * publica la web (EXPO_PUBLIC_WEB_CODIGO). La web se actualiza con su service worker.
 */
export function versionActual(): { version: string; codigo: number; texto: string } {
  const version = Constants.expoConfig?.version ?? '0.0.0';
  const codigo = Number(process.env.EXPO_PUBLIC_WEB_CODIGO ?? 0) || 0;
  return { version, codigo, texto: `${version} (${codigo})` };
}

/** Nombre por defecto del equipo; el dueño escribe el suyo al vincular el PC. */
export function nombreDispositivo(): string {
  return 'PC';
}
