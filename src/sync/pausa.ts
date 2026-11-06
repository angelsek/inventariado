/**
 * Pausa de la sincronización automática. Al cambiar de local se borra la base de este equipo: una
 * sincronización a medias seguiría bajando datos del local anterior dentro de la base ya vacía.
 * Vive en un módulo aparte para que `sesion/cuenta` y `sync/ejecutar` no se importen entre sí.
 */
let pausada = false;
let enCurso: Promise<void> | null = null;

export const sincronizacionPausada = () => pausada;

/** `ejecutar.ts` avisa cuál es la sincronización en curso (null: ninguna). */
export function registrarEnCurso(sincronizacion: Promise<void> | null): void {
  enCurso = sincronizacion;
}

/** Impide que empiecen sincronizaciones nuevas y espera a que termine la que está corriendo. */
export async function pausarSincronizacion(): Promise<void> {
  pausada = true;
  await enCurso?.catch(() => {});
}

export function reanudarSincronizacion(): void {
  pausada = false;
}
