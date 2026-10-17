import { codigoValido } from './lectura';

/** Una pistola lectora "teclea" el código muy rápido; una persona, nunca tan seguido. */
export const MAX_ENTRE_TECLAS_MS = 40;
export const LARGO_MINIMO = 6;

/** Largo de los códigos GS1 → tipo, para validar su dígito verificador. */
const TIPOS_GS1: Record<number, string[]> = {
  8: ['ean8', 'upc_e'],
  12: ['upc_a'],
  13: ['ean13'],
  14: ['itf14'],
};

/** ¿Es un código aceptable? Los numéricos de largo GS1 deben traer su dígito verificador bien. */
export function codigoDePistolaValido(codigo: string): boolean {
  if (codigo.length < LARGO_MINIMO) return false;
  const tipos = /^\d+$/.test(codigo) ? TIPOS_GS1[codigo.length] : undefined;
  if (!tipos) return true;
  return tipos.some((tipo) => codigoValido(tipo, codigo));
}

/**
 * Reconoce los códigos que manda una pistola USB (se comporta como un teclado):
 * una ráfaga de caracteres con menos de MAX_ENTRE_TECLAS_MS entre cada uno, terminada
 * en Enter. `tecla` devuelve true cuando ese Enter cerró un código (y no hay que
 * tratarlo como un Enter normal).
 */
export function crearLectorPistola(alCodigo: (codigo: string) => void) {
  let leido = '';
  let ultima = -Infinity;

  return {
    tecla(tecla: string, ms: number): boolean {
      if (tecla === 'Enter') {
        const codigo = ms - ultima <= MAX_ENTRE_TECLAS_MS ? leido : '';
        leido = '';
        ultima = -Infinity;
        if (!codigoDePistolaValido(codigo)) return false;
        alCodigo(codigo);
        return true;
      }
      // Shift, Control, flechas...: no son parte del código ni cortan la ráfaga.
      if (tecla.length !== 1) return false;
      if (ms - ultima > MAX_ENTRE_TECLAS_MS) leido = '';
      leido += tecla;
      ultima = ms;
      return false;
    },
  };
}
