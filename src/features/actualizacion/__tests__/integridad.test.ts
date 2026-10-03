import { ErrorIntegridad, hashesCoinciden, urlApkPermitida } from '../integridad';

const ORIGEN = 'https://github.com/angelsek/inventariado/releases/download/';
const HASH = 'a'.repeat(64);

describe('urlApkPermitida', () => {
  it.each([
    'https://github.com/angelsek/inventariado/releases/download/v1/stockeao.apk',
    'https://github.com/angelsek/inventariado/releases/download/build-15/stockeao.apk',
  ])('acepta %s', (url) => {
    expect(urlApkPermitida(url, ORIGEN)).toBe(true);
  });

  it.each([
    ['http en vez de https', 'http://github.com/angelsek/inventariado/releases/download/v1/a.apk'],
    ['otro host', 'https://example.com/angelsek/inventariado/releases/download/v1/a.apk'],
    [
      'subdominio que empieza igual',
      'https://github.com.evil.com/angelsek/inventariado/releases/download/v1/a.apk',
    ],
    [
      'github.com como usuario',
      'https://github.com@evil.com/angelsek/inventariado/releases/download/v1/a.apk',
    ],
    [
      'usuario y clave',
      'https://usuario:clave@github.com/angelsek/inventariado/releases/download/v1/a.apk',
    ],
    ['otro repositorio', 'https://github.com/otro/inventariado/releases/download/v1/a.apk'],
    ['solo el directorio', ORIGEN],
    ['URL inválida', 'esto no es una url'],
    ['cadena vacía', ''],
  ])('rechaza: %s', (_caso, url) => {
    expect(urlApkPermitida(url, ORIGEN)).toBe(false);
  });

  it('rechaza si el origen es inválido', () => {
    expect(urlApkPermitida(`${ORIGEN}v1/a.apk`, 'no-es-url')).toBe(false);
  });

  it('usa ORIGEN_APK por defecto', () => {
    expect(urlApkPermitida(`${ORIGEN}v1/a.apk`)).toBe(true);
    expect(urlApkPermitida('https://x/a.apk')).toBe(false);
  });
});

describe('hashesCoinciden', () => {
  it('acepta hashes iguales', () => {
    expect(hashesCoinciden(HASH, HASH)).toBe(true);
  });

  it('ignora mayúsculas y espacios', () => {
    expect(hashesCoinciden(`  ${'A'.repeat(64)}\n`, HASH)).toBe(true);
  });

  it('rechaza hashes distintos', () => {
    expect(hashesCoinciden(HASH, 'b'.repeat(64))).toBe(false);
  });

  it('rechaza longitudes incorrectas aunque sean iguales', () => {
    expect(hashesCoinciden('a'.repeat(63), 'a'.repeat(63))).toBe(false);
    expect(hashesCoinciden('a'.repeat(65), 'a'.repeat(65))).toBe(false);
    expect(hashesCoinciden('', '')).toBe(false);
  });

  it('rechaza caracteres no hexadecimales aunque sean iguales', () => {
    const malo = 'g'.repeat(64);
    expect(hashesCoinciden(malo, malo)).toBe(false);
  });
});

describe('ErrorIntegridad', () => {
  it('es un Error con nombre propio', () => {
    const e = new ErrorIntegridad('x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ErrorIntegridad');
    expect(e.message).toBe('x');
  });
});
