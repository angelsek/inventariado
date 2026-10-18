import { StyleSheet, Text, View } from 'react-native';

import { colores } from '@/theme/colores';

/** Colores de la marca (los mismos de assets/marca/). */
export const coloresMarca = {
  fondo: colores.primario,
  mostaza: '#F2B33D',
  mostazaOscura: '#D9952A',
  menta: '#CFE3DC',
  blanco: '#FFFFFF',
} as const;

/**
 * Cajas del logo en el lienzo de 120 de assets/marca/logo.svg: posición, color y cinta.
 * Si cambia el SVG, actualizar también esto (y al revés).
 */
const CAJAS = [
  { x: 42, y: 22, color: coloresMarca.blanco, cinta: 64 },
  { x: 22, y: 49, color: coloresMarca.mostaza, cinta: 44 },
  { x: 42, y: 76, color: coloresMarca.menta, cinta: 64 },
] as const;

/** Ícono de Stockeao: tres cajas escalonadas sobre el cuadrado verde redondeado. */
export function LogoStockeao({ tamano = 96 }: { tamano?: number }) {
  const u = tamano / 120;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Logo de Stockeao"
      testID="logo-stockeao"
      style={{
        width: tamano,
        height: tamano,
        borderRadius: 26 * u,
        backgroundColor: coloresMarca.fondo,
      }}
    >
      {CAJAS.map((caja) => (
        <View
          key={caja.color}
          testID="logo-caja"
          style={[
            estilos.caja,
            {
              left: caja.x * u,
              top: caja.y * u,
              width: 56 * u,
              height: 24 * u,
              borderRadius: 5 * u,
              backgroundColor: caja.color,
            },
          ]}
        >
          <View
            style={[
              estilos.cinta,
              { left: (caja.cinta - caja.x) * u, width: 12 * u, height: 7 * u },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

/** Nombre de la marca: "stockeao" en minúscula con el "ao" en mostaza. */
export function Logotipo({
  tamano = 32,
  sobreVerde = false,
}: {
  tamano?: number;
  sobreVerde?: boolean;
}) {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="Stockeao"
      style={[
        estilos.logotipo,
        { fontSize: tamano, color: sobreVerde ? coloresMarca.blanco : colores.primario },
      ]}
    >
      stocke
      <Text style={{ color: sobreVerde ? coloresMarca.mostaza : coloresMarca.mostazaOscura }}>
        ao
      </Text>
    </Text>
  );
}

const estilos = StyleSheet.create({
  caja: { position: 'absolute', overflow: 'hidden' },
  cinta: { position: 'absolute', top: 0, backgroundColor: 'rgba(31, 78, 69, 0.25)' },
  logotipo: { fontWeight: '800', letterSpacing: -0.5 },
});
