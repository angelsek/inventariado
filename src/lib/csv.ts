/**
 * Lee un CSV simple. Detecta el separador (";" es el que usa Excel en Chile,
 * "," el estándar) y respeta campos entre comillas con separadores o comillas dobles.
 */
export function leerCsv(texto: string): string[][] {
  const contenido = texto.replace(/^﻿/, ''); // BOM que agrega Excel
  const primeraLinea = contenido.split(/\r?\n/, 1)[0] ?? '';
  const separador =
    (primeraLinea.match(/;/g)?.length ?? 0) >= (primeraLinea.match(/,/g)?.length ?? 0) ? ';' : ',';

  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i];
    if (entreComillas) {
      if (c === '"' && contenido[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenido[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas
    .map((f) => f.map((valor) => valor.trim()))
    .filter((f) => f.some((valor) => valor !== ''));
}
