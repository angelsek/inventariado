/**
 * Reglas para aceptar un código leído por la cámara.
 *
 * La cámara a veces informa lecturas parciales o equivocadas (sobre todo con
 * códigos lejanos, borrosos o que no están en el rectángulo). Para evitar
 * números inventados, un código solo se acepta si:
 * 1. Está completo dentro del rectángulo de la pantalla.
 * 2. Tiene el largo y el dígito verificador correctos (EAN, UPC, ITF-14).
 * 3. Se lee igual varias veces seguidas.
 */

export type Punto = { x: number; y: number };
export type Rectangulo = { x: number; y: number; ancho: number; alto: number };

export type Lectura = {
  type: string;
  data: string;
  cornerPoints?: Punto[];
  bounds?: { origin: Punto; size: { width: number; height: number } };
};

/** Margen (en puntos de pantalla) que se tolera fuera del rectángulo. */
const TOLERANCIA = 12;

/** Lecturas iguales seguidas que se piden antes de aceptar un código. */
export const LECTURAS_CON_VERIFICADOR = 2;
export const LECTURAS_SIN_VERIFICADOR = 3;

const LARGOS: Record<string, number[]> = {
  ean13: [13],
  ean8: [8],
  upc_a: [12],
  upc_e: [8],
  itf14: [14],
};

/** Dígito verificador GS1 (EAN-8, EAN-13, UPC-A, ITF-14). */
function verificadorGs1(codigo: string): boolean {
  const digitos = [...codigo].map(Number);
  const control = digitos.pop()!;
  let suma = 0;
  // Desde la derecha, los dígitos alternan peso 3 y 1.
  digitos.reverse().forEach((d, i) => (suma += d * (i % 2 === 0 ? 3 : 1)));
  return (10 - (suma % 10)) % 10 === control;
}

/** Expande un UPC-E (8 dígitos) a su UPC-A equivalente. */
function upcEaUpcA(codigo: string): string | null {
  const sistema = codigo[0];
  if (sistema !== '0' && sistema !== '1') return null;
  const [d1, d2, d3, d4, d5, d6] = codigo.slice(1, 7);
  const control = codigo[7];
  let cuerpo: string;
  switch (d6) {
    case '0':
    case '1':
    case '2':
      cuerpo = `${d1}${d2}${d6}0000${d3}${d4}${d5}`;
      break;
    case '3':
      cuerpo = `${d1}${d2}${d3}00000${d4}${d5}`;
      break;
    case '4':
      cuerpo = `${d1}${d2}${d3}${d4}00000${d5}`;
      break;
    default:
      cuerpo = `${d1}${d2}${d3}${d4}${d5}0000${d6}`;
  }
  return `${sistema}${cuerpo}${control}`;
}

/**
 * Revisa el largo y el dígito verificador según el tipo de código.
 * Los tipos sin verificador obligatorio (Code 128) solo se revisan por largo.
 */
export function codigoValido(tipo: string, codigo: string): boolean {
  const largos = LARGOS[tipo];
  if (!largos) return codigo.length >= 4;
  if (!/^\d+$/.test(codigo) || !largos.includes(codigo.length)) return false;
  if (tipo === 'upc_e') {
    const upcA = upcEaUpcA(codigo);
    return !!upcA && verificadorGs1(upcA);
  }
  return verificadorGs1(codigo);
}

export function tieneVerificador(tipo: string): boolean {
  return tipo in LARGOS;
}

function puntosDe(lectura: Lectura): Punto[] {
  if (lectura.cornerPoints?.length) return lectura.cornerPoints;
  const b = lectura.bounds;
  if (!b || b.size.width <= 0 || b.size.height <= 0) return [];
  return [
    b.origin,
    { x: b.origin.x + b.size.width, y: b.origin.y },
    { x: b.origin.x + b.size.width, y: b.origin.y + b.size.height },
    { x: b.origin.x, y: b.origin.y + b.size.height },
  ];
}

function contiene(r: Rectangulo, p: Punto, margen: number): boolean {
  return (
    p.x >= r.x - margen &&
    p.x <= r.x + r.ancho + margen &&
    p.y >= r.y - margen &&
    p.y <= r.y + r.alto + margen
  );
}

/**
 * ¿El código está completo dentro del marco?
 * `vista` es el área de la cámara: si el teléfono entrega posiciones que ni
 * siquiera caen dentro de ella (dato inválido), no se descarta por posición.
 */
export function dentroDelMarco(lectura: Lectura, marco: Rectangulo, vista: Rectangulo): boolean {
  const puntos = puntosDe(lectura);
  if (puntos.length === 0) return true;
  if (!puntos.some((p) => contiene(vista, p, 0))) return true;
  return puntos.every((p) => contiene(marco, p, TOLERANCIA));
}

/**
 * Devuelve una función que recibe cada lectura válida y responde el código
 * solo cuando se leyó igual las veces necesarias seguidas.
 */
export function crearConfirmador() {
  let anterior: string | null = null;
  let veces = 0;
  return {
    leer(tipo: string, codigo: string): string | null {
      const clave = `${tipo}:${codigo}`;
      veces = clave === anterior ? veces + 1 : 1;
      anterior = clave;
      const necesarias = tieneVerificador(tipo)
        ? LECTURAS_CON_VERIFICADOR
        : LECTURAS_SIN_VERIFICADOR;
      if (veces < necesarias) return null;
      veces = 0;
      anterior = null;
      return codigo;
    },
    reiniciar() {
      anterior = null;
      veces = 0;
    },
  };
}
