/**
 * Estado de la suscripción del negocio. Misma regla que
 * inventariado.estado_suscripcion() en el servidor (fase 5).
 */

export const DIAS_GRACIA = 7;

export type Plan = 'basico' | 'pro';

export const NOMBRE_PLAN: Record<string, string> = { basico: 'Básico', pro: 'Pro' };

export type Suscripcion = {
  planId: string;
  pruebaHasta: string | null;
  pagadoHasta: string | null;
  suspendida: boolean;
};

export type Estado = 'prueba' | 'activa' | 'vencida' | 'suspendida';

export type EstadoSuscripcion = {
  estado: Estado;
  planId: string;
  /** Fecha en que termina lo pagado o la prueba (la más tardía). */
  venceEn: Date | null;
  /** Días que faltan para vencer (negativo si ya venció). */
  diasRestantes: number | null;
  /** Días de gracia que quedan antes de pasar a solo lectura (solo si está vencida). */
  diasGracia: number | null;
  /** Suspendida: se puede ver todo, pero no vender ni modificar datos. */
  soloLectura: boolean;
};

const DIA_MS = 24 * 60 * 60 * 1000;

export function calcularEstado(s: Suscripcion, ahora = new Date()): EstadoSuscripcion {
  const prueba = s.pruebaHasta ? new Date(s.pruebaHasta) : null;
  const pagado = s.pagadoHasta ? new Date(s.pagadoHasta) : null;
  const fechas = [prueba, pagado].filter((f): f is Date => f !== null);
  const venceEn = fechas.length ? new Date(Math.max(...fechas.map((f) => f.getTime()))) : null;
  const diasRestantes = venceEn ? Math.ceil((venceEn.getTime() - ahora.getTime()) / DIA_MS) : null;

  let estado: Estado;
  if (s.suspendida) estado = 'suspendida';
  else if (pagado && pagado >= ahora) estado = 'activa';
  else if (prueba && prueba >= ahora) estado = 'prueba';
  else if (venceEn && venceEn.getTime() + DIAS_GRACIA * DIA_MS >= ahora.getTime())
    estado = 'vencida';
  else estado = 'suspendida';

  return {
    estado,
    planId: s.planId,
    venceEn,
    diasRestantes,
    diasGracia:
      estado === 'vencida' && venceEn
        ? Math.max(
            0,
            Math.ceil((venceEn.getTime() + DIAS_GRACIA * DIA_MS - ahora.getTime()) / DIA_MS),
          )
        : null,
    soloLectura: estado === 'suspendida',
  };
}

/** Aviso a mostrar arriba de la app, o null si no hay nada que avisar. */
export function avisoSuscripcion(e: EstadoSuscripcion): { texto: string; grave: boolean } | null {
  const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`);
  switch (e.estado) {
    case 'suspendida':
      return {
        texto: 'Suscripción suspendida: la app quedó en solo lectura. Toca para ver el detalle.',
        grave: true,
      };
    case 'vencida':
      return {
        texto: `Tu suscripción venció. Te quedan ${dias(e.diasGracia ?? 0)} antes de pasar a solo lectura.`,
        grave: true,
      };
    case 'prueba':
      return e.diasRestantes !== null && e.diasRestantes <= 3
        ? {
            texto: `Tu prueba gratis termina en ${dias(Math.max(0, e.diasRestantes))}.`,
            grave: false,
          }
        : null;
    case 'activa':
      return e.diasRestantes !== null && e.diasRestantes <= 3
        ? { texto: `Tu suscripción vence en ${dias(Math.max(0, e.diasRestantes))}.`, grave: false }
        : null;
  }
}
