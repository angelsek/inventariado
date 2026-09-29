import * as Application from 'expo-application';
import { Platform } from 'react-native';

/** Versión instalada, leída del APK (el número de build sube en cada compilación). */
export function versionActual(): { version: string; codigo: number; texto: string } {
  const version = Application.nativeApplicationVersion ?? '0.0.0';
  const codigo = Number(Application.nativeBuildVersion ?? 0) || 0;
  return { version, codigo, texto: `${version} (${codigo})` };
}

export function nombreDispositivo(): string {
  const c = Platform.constants as { Brand?: string; Model?: string };
  return [c.Brand, c.Model].filter(Boolean).join(' ') || Platform.OS;
}
