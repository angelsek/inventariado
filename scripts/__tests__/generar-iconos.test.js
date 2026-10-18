const { afterAll, beforeAll, describe, expect, it } = require('@jest/globals');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Jimp = require('jimp-compact');

const { generarIconos, PROPORCION_ADAPTABLE } = require('../generar-iconos');

// Ruta → [ancho, alto, ¿sin alfa?]
const ESPERADOS = {
  'assets/icon.png': [1024, 1024, true],
  'assets/android-icon-foreground.png': [1024, 1024, false],
  'assets/android-icon-background.png': [1024, 1024, true],
  'assets/android-icon-monochrome.png': [1024, 1024, false],
  'assets/splash-icon.png': [1024, 1024, false],
  'assets/favicon.png': [48, 48, true],
  'docs/descargar/icono.png': [512, 512, true],
  'docs/play-store/icono-512.png': [512, 512, true],
  'docs/play-store/grafico-destacado-1024x500.png': [1024, 500, true],
};

let destino;
let generados;

const leer = (ruta) => fs.readFileSync(path.join(destino, ruta));
const pixel = (imagen, x, y) => Jimp.intToRGBA(imagen.getPixelColor(x, y));

beforeAll(() => {
  destino = fs.mkdtempSync(path.join(os.tmpdir(), 'iconos-'));
  generados = generarIconos(destino);
});

afterAll(() => {
  fs.rmSync(destino, { recursive: true, force: true });
});

describe('generarIconos', () => {
  it('genera exactamente la lista de archivos esperada', () => {
    expect([...generados].sort()).toEqual(Object.keys(ESPERADOS).sort());
    for (const ruta of generados) expect(fs.existsSync(path.join(destino, ruta))).toBe(true);
  });

  it('expone la proporción del ícono adaptable', () => {
    expect(PROPORCION_ADAPTABLE).toBe(0.66);
  });

  describe.each(Object.entries(ESPERADOS))('%s', (ruta, [ancho, alto, sinAlfa]) => {
    it('es un PNG con las dimensiones y el tipo de color correctos', () => {
      const png = leer(ruta);
      expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(png.readUInt32BE(16)).toBe(ancho);
      expect(png.readUInt32BE(20)).toBe(alto);
      expect(png[24]).toBe(8); // bits por canal
      expect(png[25]).toBe(sinAlfa ? 2 : 6);
    });

    it('se decodifica y mide lo esperado', async () => {
      const imagen = await Jimp.read(leer(ruta));
      expect(imagen.bitmap.width).toBe(ancho);
      expect(imagen.bitmap.height).toBe(alto);
    });
  });

  it('el codificador RGB propio produce PNG legibles con el color correcto', async () => {
    const icono = await Jimp.read(leer('assets/icon.png'));
    expect(pixel(icono, 0, 0)).toMatchObject({ r: 0x1f, g: 0x4e, b: 0x45 });
    const fondo = await Jimp.read(leer('assets/android-icon-background.png'));
    for (const [x, y] of [
      [0, 0],
      [1023, 1023],
      [512, 512],
    ]) {
      expect(pixel(fondo, x, y)).toMatchObject({ r: 0x1f, g: 0x4e, b: 0x45 });
    }
    // Las cajas del icono completo tienen colores distintos al fondo.
    const colores = new Set();
    icono.scan(0, 0, 1024, 1024, (x, y, i) => {
      if (x % 16 === 0 && y % 16 === 0) colores.add(icono.bitmap.data.readUInt32BE(i));
    });
    expect(colores.size).toBeGreaterThan(3);
  });

  it('el gráfico destacado tiene fondo verde y contenido encima', async () => {
    const grafico = await Jimp.read(leer('docs/play-store/grafico-destacado-1024x500.png'));
    expect(pixel(grafico, 0, 0)).toMatchObject({ r: 0x1f, g: 0x4e, b: 0x45 });
    expect(pixel(grafico, 1023, 499)).toMatchObject({ r: 0x1f, g: 0x4e, b: 0x45 });
    let distintos = 0;
    grafico.scan(0, 0, 1024, 500, (x, y, i) => {
      const d = grafico.bitmap.data;
      if (d[i] !== 0x1f || d[i + 1] !== 0x4e || d[i + 2] !== 0x45) distintos++;
    });
    expect(distintos).toBeGreaterThan(1000);
  });

  describe.each(['assets/android-icon-foreground.png', 'assets/android-icon-monochrome.png'])(
    'zona segura de %s',
    (ruta) => {
      it('todo píxel visible está dentro del círculo adaptable', async () => {
        const imagen = await Jimp.read(leer(ruta));
        const radio = (33 / 108) * 1024;
        let visibles = 0;
        imagen.scan(0, 0, 1024, 1024, (x, y, i) => {
          if (imagen.bitmap.data[i + 3] > 0) {
            visibles++;
            const distancia = Math.hypot(x + 0.5 - 512, y + 0.5 - 512);
            expect(distancia).toBeLessThanOrEqual(radio);
          }
        });
        expect(visibles).toBeGreaterThan(0);
        expect(pixel(imagen, 0, 0).a).toBe(0);
      });
    },
  );

  it('el foreground tiene píxeles mostaza', async () => {
    const imagen = await Jimp.read(leer('assets/android-icon-foreground.png'));
    let mostaza = 0;
    imagen.scan(0, 0, 1024, 1024, (x, y, i) => {
      const [r, g, b, a] = imagen.bitmap.data.subarray(i, i + 4);
      if (a === 255 && r === 0xf2 && g === 0xb3 && b === 0x3d) mostaza++;
    });
    expect(mostaza).toBeGreaterThan(1000);
  });

  it('el monocromo es solo blanco y deja transparente el interior de las cajas', async () => {
    const imagen = await Jimp.read(leer('assets/android-icon-monochrome.png'));
    let blancos = 0;
    imagen.scan(0, 0, 1024, 1024, (x, y, i) => {
      const [r, g, b, a] = imagen.bitmap.data.subarray(i, i + 4);
      if (a > 0) {
        blancos++;
        expect([r, g, b]).toEqual([255, 255, 255]);
      }
    });
    expect(blancos).toBeGreaterThan(1000);
    // Centro de la caja superior (70, 34 en el lienzo de 120).
    const escala = (1024 * PROPORCION_ADAPTABLE) / 120;
    const x = Math.round(512 + (70 - 60) * escala);
    const y = Math.round(512 + (34 - 61) * escala);
    expect(pixel(imagen, x, y).a).toBe(0);
    // El borde de la caja sí es visible (x=44.5 en el lienzo).
    expect(pixel(imagen, Math.round(512 + (44.5 - 60) * escala), y).a).toBe(255);
  });
});
