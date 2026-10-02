/**
 * Colores de la app: fondo claro, verde oscuro como color principal y alto
 * contraste en los textos (la usan personas de todas las edades).
 */
export const colores = {
  primario: '#1F4E45',
  /** Fondo suave para íconos y botones grandes del color principal. */
  primarioSuave: '#E6EFEC',
  fondo: '#F4F6F5',
  superficie: '#FFFFFF',
  texto: '#18201E',
  textoSecundario: '#55625F',
  borde: '#E1E6E4',
  inactivo: '#88948F',
  error: '#C62828',
  fondoError: '#FDECEA',
  exito: '#2E7D32',
  fondoExito: '#E8F5E9',
  aviso: '#D46B08',
  fondoAviso: '#FFF3E0',
} as const;

/** Radios de las esquinas, para que todo se vea igual de redondeado. */
export const radios = { chico: 12, medio: 16, grande: 24, pastilla: 999 } as const;
