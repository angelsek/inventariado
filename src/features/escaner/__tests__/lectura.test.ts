import { codigoValido, crearConfirmador, dentroDelMarco, type Lectura } from '../lectura';

describe('codigoValido', () => {
  it('acepta EAN-13 con dígito verificador correcto y rechaza el resto', () => {
    expect(codigoValido('ean13', '7801610001196')).toBe(true);
    expect(codigoValido('ean13', '7801610001197')).toBe(false);
    expect(codigoValido('ean13', '780161000119')).toBe(false);
    expect(codigoValido('ean13', '78016100011A6')).toBe(false);
  });

  it('revisa EAN-8, UPC-A, UPC-E e ITF-14', () => {
    expect(codigoValido('ean8', '96385074')).toBe(true);
    expect(codigoValido('ean8', '96385075')).toBe(false);
    expect(codigoValido('upc_a', '036000291452')).toBe(true);
    expect(codigoValido('upc_a', '036000291453')).toBe(false);
    expect(codigoValido('upc_e', '04252614')).toBe(true);
    expect(codigoValido('upc_e', '04252615')).toBe(false);
    expect(codigoValido('itf14', '17801610001193')).toBe(true);
    expect(codigoValido('itf14', '1780161000119')).toBe(false);
  });

  it('Code 128 solo exige un largo mínimo', () => {
    expect(codigoValido('code128', 'AB-1234')).toBe(true);
    expect(codigoValido('code128', '12')).toBe(false);
  });
});

describe('dentroDelMarco', () => {
  const vista = { x: 0, y: 0, ancho: 400, alto: 800 };
  const marco = { x: 40, y: 300, ancho: 320, alto: 170 };
  const esquinas = (x1: number, y1: number, x2: number, y2: number): Lectura => ({
    type: 'ean13',
    data: '7801610001196',
    cornerPoints: [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ],
  });

  it('acepta un código completo dentro del rectángulo', () => {
    expect(dentroDelMarco(esquinas(80, 340, 320, 430), marco, vista)).toBe(true);
  });

  it('rechaza códigos fuera o cortados por el borde del rectángulo', () => {
    expect(dentroDelMarco(esquinas(80, 100, 320, 200), marco, vista)).toBe(false);
    expect(dentroDelMarco(esquinas(10, 340, 320, 430), marco, vista)).toBe(false);
  });

  it('usa bounds si no hay esquinas', () => {
    const lectura: Lectura = {
      type: 'ean13',
      data: '7801610001196',
      cornerPoints: [],
      bounds: { origin: { x: 60, y: 600 }, size: { width: 200, height: 80 } },
    };
    expect(dentroDelMarco(lectura, marco, vista)).toBe(false);
  });

  it('sin posición confiable no descarta la lectura', () => {
    expect(dentroDelMarco({ type: 'ean13', data: '1' }, marco, vista)).toBe(true);
    expect(dentroDelMarco(esquinas(5000, 5000, 5200, 5100), marco, vista)).toBe(true);
  });
});

describe('crearConfirmador', () => {
  it('pide 2 lecturas iguales para códigos con verificador y 3 para Code 128', () => {
    const c = crearConfirmador();
    expect(c.leer('ean13', '7801610001196')).toBeNull();
    expect(c.leer('ean13', '7801610001196')).toBe('7801610001196');

    expect(c.leer('code128', 'ABC1')).toBeNull();
    expect(c.leer('code128', 'ABC1')).toBeNull();
    expect(c.leer('code128', 'ABC1')).toBe('ABC1');
  });

  it('una lectura distinta en medio reinicia la cuenta', () => {
    const c = crearConfirmador();
    expect(c.leer('ean13', '7801610001196')).toBeNull();
    expect(c.leer('ean13', '96385074')).toBeNull();
    expect(c.leer('ean13', '7801610001196')).toBeNull();
    expect(c.leer('ean13', '7801610001196')).toBe('7801610001196');
  });
});
