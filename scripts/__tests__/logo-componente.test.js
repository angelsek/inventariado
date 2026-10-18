// Las cajas del componente de la app (src/components/LogoStockeao.tsx) replican a mano las de
// assets/marca/logo.svg: esta prueba avisa si uno cambia sin el otro.
const fs = require('node:fs');
const path = require('node:path');
const { describe, expect, it } = require('@jest/globals');

const { CAJAS } = require('../../src/components/LogoStockeao');

function rectsDelSvg(archivo) {
  const svg = fs.readFileSync(path.join(__dirname, '../../assets/marca', archivo), 'utf8');
  return [...svg.matchAll(/<rect ([^>]*)\/>/g)].map(([, atributos]) =>
    Object.fromEntries([...atributos.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v])),
  );
}

describe('LogoStockeao frente a logo.svg', () => {
  const rects = rectsDelSvg('logo.svg');
  const cajas = rects.filter((r) => r.width === '56');
  const cintas = rects.filter((r) => r.width === '12');

  it('tiene las mismas cajas (posición y color)', () => {
    expect(cajas.map((r) => ({ x: Number(r.x), y: Number(r.y), color: r.fill }))).toEqual(
      CAJAS.map(({ x, y, color }) => ({ x, y, color })),
    );
  });

  it('tiene las cintas en el mismo lugar', () => {
    expect(cintas.map((r) => ({ x: Number(r.x), y: Number(r.y) }))).toEqual(
      CAJAS.map((c) => ({ x: c.cinta, y: c.y })),
    );
  });
});
