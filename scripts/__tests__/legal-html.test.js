const { describe, expect, it } = require('@jest/globals');
const fs = require('node:fs');
const path = require('node:path');

const { ELIMINAR_CUENTA, PRIVACIDAD, TERMINOS } = require('../../src/legal/textos');

// docs/legal-web/*.html lo genera scripts/generar-legal.mjs desde src/legal/textos.ts y se
// publica en las URL que revisa Google Play. Si alguien edita el texto y no regenera, la
// página pública queda desactualizada o con un texto distinto al de la app.
const leerHtml = (nombre) =>
  fs.readFileSync(path.join(__dirname, '../../docs/legal-web', nombre), 'utf8');

// Quita las etiquetas y deshace el escapado del generador; compara sin importar el formato.
const textoPlano = (html) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const lineas = (texto) =>
  texto
    .split('\n')
    .map((l) => l.replace(/^- /, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

describe('docs/legal-web', () => {
  it.each([
    ['terminos.html', TERMINOS],
    ['privacidad.html', PRIVACIDAD],
    ['eliminar-cuenta.html', ELIMINAR_CUENTA],
  ])('%s trae todas las líneas del texto de la app', (archivo, texto) => {
    const plano = textoPlano(leerHtml(archivo));
    expect(lineas(texto).filter((l) => !plano.includes(l))).toEqual([]);
  });

  it('eliminar-cuenta.html es la página de eliminar cuenta y no los Términos', () => {
    const plano = textoPlano(leerHtml('eliminar-cuenta.html'));
    expect(plano).toContain(lineas(ELIMINAR_CUENTA)[0]);
    expect(plano).not.toContain(lineas(TERMINOS)[0]);
  });

  it('cada página enlaza a las demás', () => {
    for (const archivo of ['terminos.html', 'privacidad.html', 'eliminar-cuenta.html']) {
      const html = leerHtml(archivo);
      for (const destino of [
        'index.html',
        'privacidad.html',
        'terminos.html',
        'eliminar-cuenta.html',
      ]) {
        expect(html).toContain(`href="${destino}"`);
      }
    }
  });
});
