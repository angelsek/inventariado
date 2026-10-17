import type { MedioPago } from '@/features/ventas/calculos';

/** Lo que hace cada tecla en la caja del PC (ver la tabla de atajos en docs/WEB.md). */
export type AccionPos =
  | { tipo: 'buscar' }
  | { tipo: 'montoLibre' }
  | { tipo: 'descuento' }
  | { tipo: 'abrirCaja' }
  | { tipo: 'otrosPagos' }
  | { tipo: 'cobrar'; medio: MedioPago }
  | { tipo: 'mover'; paso: 1 | -1 }
  | { tipo: 'cantidad'; paso: 1 | -1 }
  | { tipo: 'quitar' }
  | { tipo: 'cancelar' }
  | { tipo: 'confirmar' };

/** Teclas de medios de pago: F9 Efectivo, F10 Débito, F11 Crédito, F12 Transferencia. */
export const TECLAS_PAGO: Record<string, MedioPago> = {
  F9: 'efectivo',
  F10: 'debito',
  F11: 'credito',
  F12: 'transferencia',
};

export const TECLA_DE_MEDIO = Object.fromEntries(
  Object.entries(TECLAS_PAGO).map(([tecla, medio]) => [medio, tecla]),
) as Partial<Record<MedioPago, string>>;

export type ContextoTecla = {
  /** 'venta': armando el carro; 'cobro': eligiendo pago y monto recibido. */
  modo: 'venta' | 'cobro';
  /** El buscador tiene texto escrito (+, - y Supr se dejan para el texto). */
  buscadorConTexto: boolean;
  hayItems: boolean;
};

/** Acción de una tecla, o null si la tecla debe comportarse normalmente. */
export function accionDeTecla(
  tecla: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean },
  contexto: ContextoTecla,
): AccionPos | null {
  if (tecla.ctrlKey || tecla.altKey || tecla.metaKey) return null;
  const { key } = tecla;
  const medio = TECLAS_PAGO[key];

  if (contexto.modo === 'cobro') {
    if (medio) return { tipo: 'cobrar', medio };
    if (key === 'F8') return { tipo: 'otrosPagos' };
    if (key === 'Enter') return { tipo: 'confirmar' };
    if (key === 'Escape') return { tipo: 'cancelar' };
    return null;
  }

  switch (key) {
    case 'F3':
      return { tipo: 'buscar' };
    case 'F4':
      return { tipo: 'montoLibre' };
    case 'F6':
      return contexto.hayItems ? { tipo: 'descuento' } : null;
    case 'F7':
      return { tipo: 'abrirCaja' };
    case 'F8':
      return contexto.hayItems ? { tipo: 'otrosPagos' } : null;
    case 'Escape':
      return contexto.hayItems && !contexto.buscadorConTexto ? { tipo: 'cancelar' } : null;
  }
  if (medio) return contexto.hayItems ? { tipo: 'cobrar', medio } : null;
  if (contexto.buscadorConTexto || !contexto.hayItems) return null;
  switch (key) {
    case 'ArrowDown':
      return { tipo: 'mover', paso: 1 };
    case 'ArrowUp':
      return { tipo: 'mover', paso: -1 };
    case '+':
      return { tipo: 'cantidad', paso: 1 };
    case '-':
      return { tipo: 'cantidad', paso: -1 };
    case 'Delete':
      return { tipo: 'quitar' };
  }
  return null;
}
