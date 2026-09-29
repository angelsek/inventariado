/**
 * Tablas que se sincronizan con Supabase, en el orden en que se suben
 * (primero las que otras referencian).
 */
export type TablaSync = {
  nombre: string;
  /** Columnas compartidas con el servidor (sin `pendiente`). */
  columnas: readonly string[];
  /** Columnas guardadas como 0/1 en SQLite y como boolean en Postgres. */
  booleanas: readonly string[];
};

const control = ['creado_en', 'actualizado_en', 'eliminado'] as const;

export const TABLAS_SYNC: readonly TablaSync[] = [
  {
    nombre: 'negocios',
    columnas: ['id', 'nombre', 'rut', 'direccion', ...control],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'dispositivos',
    columnas: ['id', 'negocio_id', 'nombre', 'ultimo_sync', ...control],
    booleanas: ['eliminado'],
  },
  {
    nombre: 'perfiles',
    columnas: ['id', 'negocio_id', 'nombre', 'rol', 'pin_hash', 'activo', ...control],
    booleanas: ['activo', 'eliminado'],
  },
];
