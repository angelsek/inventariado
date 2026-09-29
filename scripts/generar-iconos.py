"""
Genera el ícono de la app y las imágenes de Google Play a partir de un dibujo
simple (un almacén con toldo). Uso: python3 scripts/generar-iconos.py
Requiere Pillow (pip install pillow).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
AZUL = (21, 101, 192, 255)
AZUL_OSCURO = (13, 71, 161, 255)
BLANCO = (255, 255, 255, 255)
CELESTE = (187, 222, 251, 255)
TRANSPARENTE = (0, 0, 0, 0)
ESCALA = 4  # se dibuja más grande y se reduce, para bordes suaves


def dibujar_almacen(d: ImageDraw.ImageDraw, x: float, y: float, ancho: float, frente, detalle, toldo2):
    """Almacén con toldo a rayas dentro del cuadrado (x, y, ancho)."""
    a = ancho
    # Toldo: franja con rayas y borde inferior ondulado.
    alto_toldo = a * 0.24
    rayas = 5
    ancho_raya = a / rayas
    for i in range(rayas):
        color = frente if i % 2 == 0 else toldo2
        d.rectangle([x + i * ancho_raya, y, x + (i + 1) * ancho_raya, y + alto_toldo], fill=color)
        r = ancho_raya / 2
        d.ellipse([x + i * ancho_raya, y + alto_toldo - r, x + (i + 1) * ancho_raya, y + alto_toldo + r], fill=color)
    # Cuerpo del local.
    margen = a * 0.07
    arriba = y + alto_toldo + ancho_raya / 2 + a * 0.03
    abajo = y + a
    d.rectangle([x + margen, arriba, x + a - margen, abajo], fill=frente)
    # Puerta y vitrina.
    puerta_ancho = a * 0.26
    px = x + a * 0.16
    d.rounded_rectangle([px, arriba + a * 0.12, px + puerta_ancho, abajo], radius=a * 0.03, fill=detalle)
    vx = x + a * 0.50
    d.rounded_rectangle([vx, arriba + a * 0.12, x + a * 0.84, arriba + a * 0.40], radius=a * 0.03, fill=detalle)
    # Código de barras en la vitrina (guiño al escáner).
    barras = [0.03, 0.015, 0.03, 0.02, 0.015, 0.03]
    bx = vx + a * 0.04
    for i, ancho_barra in enumerate(barras):
        if i % 2 == 0:
            d.rectangle([bx, arriba + a * 0.17, bx + a * ancho_barra, arriba + a * 0.35], fill=frente)
        bx += a * ancho_barra + a * 0.01


def lienzo(ancho: int, alto: int, fondo):
    return Image.new('RGBA', (ancho * ESCALA, alto * ESCALA), fondo)


def guardar(img: Image.Image, ruta: Path, tamano, sin_alfa=False):
    img = img.resize(tamano, Image.LANCZOS)
    if sin_alfa:
        img = img.convert('RGB')
    ruta.parent.mkdir(parents=True, exist_ok=True)
    img.save(ruta, optimize=True)
    print('generado', ruta.relative_to(RAIZ))


def icono_completo(lado: int, proporcion=0.56):
    """Fondo azul con el almacén en blanco (ícono clásico / Play Store)."""
    img = lienzo(lado, lado, AZUL)
    d = ImageDraw.Draw(img)
    a = lado * ESCALA * proporcion
    x = (lado * ESCALA - a) / 2
    dibujar_almacen(d, x, x - a * 0.04, a, BLANCO, AZUL, CELESTE)
    return img


def glifo(lado: int, proporcion: float, frente, detalle, toldo2):
    img = lienzo(lado, lado, TRANSPARENTE)
    d = ImageDraw.Draw(img)
    a = lado * ESCALA * proporcion
    x = (lado * ESCALA - a) / 2
    dibujar_almacen(d, x, x, a, frente, detalle, toldo2)
    return img


def fuente(tamano: int):
    for nombre in ['DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']:
        try:
            return ImageFont.truetype(nombre, tamano)
        except OSError:
            continue
    return ImageFont.load_default()


def grafico_destacado():
    """Imagen destacada de Google Play (1024x500, sin transparencia)."""
    ancho, alto = 1024, 500
    img = lienzo(ancho, alto, AZUL)
    d = ImageDraw.Draw(img)
    a = alto * ESCALA * 0.5
    dibujar_almacen(d, 90 * ESCALA, (alto * ESCALA - a) / 2, a, BLANCO, AZUL, CELESTE)
    d.text((400 * ESCALA, 170 * ESCALA), 'Inventariado', font=fuente(72 * ESCALA), fill=BLANCO)
    d.text(
        (404 * ESCALA, 268 * ESCALA),
        'Ventas, stock y caja para\ntu almacén o botillería',
        font=fuente(32 * ESCALA),
        fill=CELESTE,
        spacing=10 * ESCALA,
    )
    return img


if __name__ == '__main__':
    assets = RAIZ / 'assets'
    play = RAIZ / 'docs' / 'play-store'
    guardar(icono_completo(1024), assets / 'icon.png', (1024, 1024), sin_alfa=True)
    # Ícono adaptable de Android: el sistema recorta el centro (~66 %).
    guardar(glifo(1024, 0.46, BLANCO, AZUL, CELESTE), assets / 'android-icon-foreground.png', (512, 512))
    guardar(lienzo(512, 512, AZUL), assets / 'android-icon-background.png', (512, 512))
    guardar(glifo(1024, 0.46, BLANCO, TRANSPARENTE, BLANCO), assets / 'android-icon-monochrome.png', (432, 432))
    guardar(glifo(1024, 0.8, AZUL, BLANCO, CELESTE), assets / 'splash-icon.png', (1024, 1024))
    guardar(icono_completo(256), assets / 'favicon.png', (48, 48))
    guardar(icono_completo(512), play / 'icono-512.png', (512, 512), sin_alfa=True)
    guardar(grafico_destacado(), play / 'grafico-destacado-1024x500.png', (1024, 500), sin_alfa=True)
