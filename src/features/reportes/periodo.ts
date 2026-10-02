/** Períodos de los reportes: día, semana (lunes a domingo) o mes, en hora local. */

export type TipoPeriodo = 'dia' | 'semana' | 'mes';

export type Periodo = {
  tipo: TipoPeriodo;
  inicio: Date;
  /** Exclusivo. */
  fin: Date;
};

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function calcularPeriodo(tipo: TipoPeriodo, referencia: Date): Periodo {
  const a = referencia.getFullYear();
  const m = referencia.getMonth();
  const d = referencia.getDate();
  if (tipo === 'dia') return { tipo, inicio: new Date(a, m, d), fin: new Date(a, m, d + 1) };
  if (tipo === 'semana') {
    // getDay: 0 = domingo. La semana parte el lunes.
    const lunes = d - ((referencia.getDay() + 6) % 7);
    return { tipo, inicio: new Date(a, m, lunes), fin: new Date(a, m, lunes + 7) };
  }
  return { tipo, inicio: new Date(a, m, 1), fin: new Date(a, m + 1, 1) };
}

/** El período anterior (-1) o siguiente (+1) del mismo tipo. */
export function moverPeriodo(p: Periodo, pasos: number): Periodo {
  const i = p.inicio;
  if (p.tipo === 'dia')
    return calcularPeriodo('dia', new Date(i.getFullYear(), i.getMonth(), i.getDate() + pasos));
  if (p.tipo === 'semana')
    return calcularPeriodo(
      'semana',
      new Date(i.getFullYear(), i.getMonth(), i.getDate() + 7 * pasos),
    );
  return calcularPeriodo('mes', new Date(i.getFullYear(), i.getMonth() + pasos, 1));
}

export const esPeriodoActual = (p: Periodo, ahora = new Date()) =>
  ahora >= p.inicio && ahora < p.fin;

const fechaCorta = (f: Date) => `${f.getDate()} ${MESES[f.getMonth()].slice(0, 3)}`;

export function etiquetaPeriodo(p: Periodo, ahora = new Date()): string {
  const actual = esPeriodoActual(p, ahora);
  if (p.tipo === 'dia') {
    if (actual) return 'Hoy';
    const ayer = calcularPeriodo(
      'dia',
      new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1),
    );
    if (ayer.inicio.getTime() === p.inicio.getTime()) return 'Ayer';
    return `${fechaCorta(p.inicio)} ${p.inicio.getFullYear()}`;
  }
  if (p.tipo === 'semana') {
    if (actual) return 'Esta semana';
    const ultimo = new Date(p.fin.getFullYear(), p.fin.getMonth(), p.fin.getDate() - 1);
    return `${fechaCorta(p.inicio)} – ${fechaCorta(ultimo)}`;
  }
  const mes = MESES[p.inicio.getMonth()];
  return `${mes[0].toUpperCase()}${mes.slice(1)} ${p.inicio.getFullYear()}`;
}

/** "lun 3", para las barras de ventas por día. */
export function etiquetaDia(f: Date): string {
  return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][f.getDay()]} ${f.getDate()}`;
}

/** Clave "AAAA-MM-DD" del día local de una fecha. */
export function claveDia(f: Date): string {
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}
