#!/usr/bin/env node
// Genera el ícono de la app, el splash, el favicon y las imágenes de Google Play y de la página de
// descarga a partir de los SVG de assets/marca/ (logo "cajas en S"). Ver assets/marca/LEEME.md.
//
//   npm run iconos:generar            escribe en el repo
//   node scripts/generar-iconos.js <dir>   escribe en otro directorio (lo usan las pruebas)
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { Resvg } = require('@resvg/resvg-js');

const RAIZ = path.resolve(__dirname, '..');
const MARCA = path.join(RAIZ, 'assets', 'marca');
const FUENTE = path.join(MARCA, 'fuentes', 'Nunito-Bold.ttf');

const VERDE = '#1F4E45';
const MENTA = '#CFE3DC';

// Centro del dibujo de las cajas en el lienzo de 120 (van de x 22 a 98 y de y 22 a 100).
const CENTRO = { x: 60, y: 61 };
// Ícono adaptable: Android muestra un círculo de 66dp dentro de 108dp. El lienzo de 120 ocupa el
// 66 % del lado, así la esquina más lejana (a ~52 unidades del centro) queda dentro del círculo.
const PROPORCION_ADAPTABLE = 0.66;

/** Contenido de un SVG sin la etiqueta <svg> ni los comentarios, para componerlo en otro. */
function interior(archivo) {
  return fs
    .readFileSync(path.join(MARCA, archivo), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .trim();
}

function svg(ancho, alto, contenido) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">${contenido}</svg>`;
}

/** Glifo (o monocromo) centrado en un lienzo cuadrado, ocupando `proporcion` del lado. */
function centrado(lado, proporcion, contenido) {
  const escala = (lado * proporcion) / 120;
  const dx = lado / 2 - CENTRO.x * escala;
  const dy = lado / 2 - CENTRO.y * escala;
  return svg(lado, lado, `<g transform="translate(${dx} ${dy}) scale(${escala})">${contenido}</g>`);
}

function iconoCompleto(lado) {
  return svg(lado, lado, `<g transform="scale(${lado / 120})">${interior('logo.svg')}</g>`);
}

function graficoDestacado() {
  const glifo = interior('logo-glifo.svg');
  const logotipo = interior('logotipo-verde.svg');
  const lema = (y, texto) =>
    `<text x="0" y="${y}" font-family="Nunito" font-weight="700" font-size="34" fill="${MENTA}">${texto}</text>`;
  return svg(
    1024,
    500,
    `<rect width="1024" height="500" fill="${VERDE}"/>` +
      `<g transform="translate(40 34) scale(3.6)">${glifo}</g>` +
      `<g transform="translate(430 150) scale(1.3)">${logotipo}</g>` +
      `<g transform="translate(438 0)">${lema(320, 'Ventas, stock y caja para')}${lema(366, 'tu negocio de barrio')}</g>`,
  );
}

function renderizar(contenido, sinAlfa) {
  const resvg = new Resvg(contenido, {
    font: { fontFiles: [FUENTE], loadSystemFonts: false, defaultFontFamily: 'Nunito' },
  });
  const imagen = resvg.render();
  return sinAlfa ? pngRgb(imagen.width, imagen.height, imagen.pixels) : imagen.asPng();
}

/** PNG sin canal alfa (Play Store no acepta transparencia) a partir de píxeles RGBA opacos. */
function pngRgb(ancho, alto, rgba) {
  const filas = Buffer.alloc(alto * (ancho * 3 + 1));
  for (let y = 0; y < alto; y++) {
    const inicio = y * (ancho * 3 + 1); // el byte 0 de cada fila es el filtro (0 = ninguno)
    for (let x = 0; x < ancho; x++) {
      const o = (y * ancho + x) * 4;
      rgba.copy(filas, inicio + 1 + x * 3, o, o + 3);
    }
  }
  const bloque = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(alto, 4);
  cabecera.writeUInt8(8, 8); // 8 bits por canal
  cabecera.writeUInt8(2, 9); // color RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', cabecera),
    bloque('IDAT', zlib.deflateSync(filas, { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

/** Archivos a generar: ruta relativa → SVG y si el PNG va sin transparencia. */
function piezas() {
  const glifo = interior('logo-glifo.svg');
  const monocromo = interior('logo-monocromo.svg');
  return [
    { ruta: 'assets/icon.png', svg: iconoCompleto(1024), sinAlfa: true },
    {
      ruta: 'assets/android-icon-foreground.png',
      svg: centrado(1024, PROPORCION_ADAPTABLE, glifo),
    },
    {
      ruta: 'assets/android-icon-background.png',
      svg: svg(1024, 1024, `<rect width="1024" height="1024" fill="${VERDE}"/>`),
      sinAlfa: true,
    },
    {
      ruta: 'assets/android-icon-monochrome.png',
      svg: centrado(1024, PROPORCION_ADAPTABLE, monocromo),
    },
    // Android 12+ recorta el ícono del splash en círculo: misma zona segura que el adaptable.
    { ruta: 'assets/splash-icon.png', svg: centrado(1024, PROPORCION_ADAPTABLE, glifo) },
    { ruta: 'assets/favicon.png', svg: iconoCompleto(48), sinAlfa: true },
    { ruta: 'docs/descargar/icono.png', svg: iconoCompleto(512), sinAlfa: true },
    { ruta: 'docs/play-store/icono-512.png', svg: iconoCompleto(512), sinAlfa: true },
    {
      ruta: 'docs/play-store/grafico-destacado-1024x500.png',
      svg: graficoDestacado(),
      sinAlfa: true,
    },
  ];
}

function generarIconos(destino = RAIZ) {
  const generados = [];
  for (const pieza of piezas()) {
    const png = renderizar(pieza.svg, pieza.sinAlfa);
    const ruta = path.join(destino, pieza.ruta);
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, png);
    generados.push(pieza.ruta);
  }
  return generados;
}

module.exports = { generarIconos, PROPORCION_ADAPTABLE };

if (require.main === module) {
  const destino = process.argv[2] ? path.resolve(process.argv[2]) : RAIZ;
  for (const ruta of generarIconos(destino)) console.log('generado', ruta);
}
