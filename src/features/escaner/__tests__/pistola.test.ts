import { codigoDePistolaValido, crearLectorPistola, MAX_ENTRE_TECLAS_MS } from '../pistola';

/** Simula teclas con `intervalo` ms entre cada una, terminando en Enter. */
function teclear(lector: ReturnType<typeof crearLectorPistola>, texto: string, intervalo: number) {
  let ms = 1000;
  for (const c of texto) {
    lector.tecla(c, ms);
    ms += intervalo;
  }
  return lector.tecla('Enter', ms);
}

it('una ráfaga rápida terminada en Enter es un código', () => {
  const leidos: string[] = [];
  const lector = crearLectorPistola((c) => leidos.push(c));
  expect(teclear(lector, '7801610001196', 8)).toBe(true);
  expect(leidos).toEqual(['7801610001196']);
});

it('lo que teclea una persona (lento) no es un código', () => {
  const leidos: string[] = [];
  const lector = crearLectorPistola((c) => leidos.push(c));
  expect(teclear(lector, '7801610001196', MAX_ENTRE_TECLAS_MS + 60)).toBe(false);
  expect(leidos).toEqual([]);
});

it('un Enter que llega tarde después de la ráfaga no cierra un código', () => {
  const leidos: string[] = [];
  const lector = crearLectorPistola((c) => leidos.push(c));
  let ms = 0;
  for (const c of '7801610001196') lector.tecla(c, (ms += 5));
  expect(lector.tecla('Enter', ms + 500)).toBe(false);
  expect(leidos).toEqual([]);
});

it('ignora Shift y otras teclas especiales dentro de la ráfaga', () => {
  const leidos: string[] = [];
  const lector = crearLectorPistola((c) => leidos.push(c));
  let ms = 0;
  for (const c of ['Shift', 'A', 'B', 'Shift', 'C', '1', '2', '3']) lector.tecla(c, (ms += 5));
  lector.tecla('Enter', ms + 5);
  expect(leidos).toEqual(['ABC123']);
});

it('rechaza códigos cortos y EAN con dígito verificador incorrecto', () => {
  expect(codigoDePistolaValido('12345')).toBe(false);
  expect(codigoDePistolaValido('7802900000012')).toBe(false);
  expect(codigoDePistolaValido('7802900000011')).toBe(true);
  // Códigos internos o Code 128 con letras se aceptan.
  expect(codigoDePistolaValido('PAN-001')).toBe(true);
});
