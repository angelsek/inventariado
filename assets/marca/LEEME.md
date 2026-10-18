# Marca de Stockeao

Logo "cajas en S": tres cajas escalonadas (blanca arriba a la derecha, mostaza al medio a la
izquierda, menta abajo a la derecha) con una cinta de embalaje verde al 25 %, sobre fondo verde.
El logotipo va en minúscula (`stockeao`) con "ao" en mostaza, en Nunito Bold.

## Paleta

| Uso                                 | Color     |
| ----------------------------------- | --------- |
| Fondo                               | `#1F4E45` |
| Caja blanca                         | `#FFFFFF` |
| Caja mostaza                        | `#F2B33D` |
| Caja menta                          | `#CFE3DC` |
| "ao" del logotipo sobre fondo claro | `#D9952A` |
| "ao" del logotipo sobre fondo verde | `#F2B33D` |

## Archivos fuente (SVG)

- `logo.svg`: logo completo (cajas sobre fondo verde).
- `logo-glifo.svg`: solo las cajas, sin fondo (capa frontal del ícono adaptable).
- `logo-monocromo.svg`: cajas en un solo color (ícono temático de Android 13+).
- `logotipo-claro.svg`: logotipo "stockeao" para fondos claros.
- `logotipo-verde.svg`: logotipo "stockeao" para fondos verdes.

## Zona segura

Android recorta el ícono adaptable con distintas máscaras (círculo, squircle...). Por eso el
glifo ocupa el 66 % del lado en la capa frontal (foreground), en el monocromo y en el splash.
Esa regla se verifica en `scripts/__tests__/generar-iconos.test.js`.

## Regenerar los PNG

```bash
npm run iconos:generar
```

Requiere Node 22.2 o superior. Lee los SVG de esta carpeta y escribe:

- `assets/*`: íconos de la app (ícono, capas del ícono adaptable, monocromo, splash, etc.).
- `docs/descargar/icono.png`: ícono de la página de descarga.
- `docs/play-store/icono-512.png`: ícono de la ficha de Play Store.
- `docs/play-store/grafico-destacado-1024x500.png`: imagen destacada de Play Store.

## Fuente

`fuentes/Nunito-Bold.ttf` es una instancia estática de peso 700 de la fuente variable oficial
`Nunito[wght].ttf` de github.com/google/fonts (`ofl/nunito`), creada con
`fonttools varLib.instancer wght=700 --static`. Licencia SIL OFL 1.1 (`fuentes/OFL.txt`).

## Dentro de la app

`src/components/LogoStockeao.tsx` dibuja el logo en código, no carga los SVG:

- El logotipo usa la fuente del sistema en negrita, no Nunito.
- Las cajas replican la geometría de `logo.svg`: si cambia uno hay que cambiar el otro.
