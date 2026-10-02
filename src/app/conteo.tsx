import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { Boton } from '@/components/Boton';
import { BuscadorProductos } from '@/components/BuscadorProductos';
import { Formulario } from '@/components/Formulario';
import type { Producto } from '@/db/productos';
import { aplicarConteo, useConteo } from '@/features/inventario/conteo';
import { formatearCantidad, parsearCantidad } from '@/lib/numeros';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';
import { sincronizarAhora } from '@/sync/ejecutar';
import { colores } from '@/theme/colores';
import { bloqueadoPorSuscripcion } from '@/features/suscripcion/useSoloLectura';

/** Toma de inventario: contar lo que hay y dejar el stock igual a lo contado. */
export default function ConteoScreen() {
  const db = useSQLiteContext();
  const { negocioId, datosCambiaron } = useSesion();
  const { lineas, sumar, fijar, quitar, vaciar } = useConteo();
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const alElegir = (p: Producto) => {
    if (p.packProductoId) {
      setResultado(`"${p.nombre}" es un pack: cuenta las unidades sueltas de su producto base.`);
      return;
    }
    setResultado(null);
    // Cada escaneo suma 1; los productos por kilo se escriben a mano.
    sumar(
      { productoId: p.id, nombre: p.nombre, unidad: p.unidad, stockSistema: p.stock },
      p.unidad === 'kg' ? 0 : 1,
    );
  };

  const aplicar = () =>
    !bloqueadoPorSuscripcion() &&
    Alert.alert(
      'Aplicar conteo',
      `El stock de ${lineas.length} producto(s) quedará igual a lo contado. Hazlo sin vender al mismo tiempo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aplicar',
          onPress: async () => {
            setAplicando(true);
            const r = await aplicarConteo(db, negocioId!, lineas, await obtenerAutor(db));
            vaciar();
            datosCambiaron();
            sincronizarAhora(db);
            setAplicando(false);
            setResultado(
              `Listo: ${r.ajustados} producto(s) ajustado(s), ${r.sinCambios} sin diferencias.`,
            );
          },
        },
      ],
    );

  return (
    <Formulario
      titulo="Conteo de inventario"
      subtitulo="Escanea cada unidad (cada lectura suma 1) o busca el producto y escribe la cantidad."
    >
      <BuscadorProductos onElegir={alElegir} escanerContinuo />

      {resultado ? (
        <View style={estilos.resultado}>
          <Text style={estilos.ok}>{resultado}</Text>
          <Boton
            titulo="Volver al inventario"
            variante="secundario"
            onPress={() => router.back()}
          />
        </View>
      ) : null}

      {lineas.map((l) => {
        const diferencia = Math.round((l.contado - l.stockSistema) * 1000) / 1000;
        return (
          <View key={l.productoId} style={estilos.linea}>
            <View style={estilos.flex}>
              <Text style={estilos.nombre}>{l.nombre}</Text>
              <Text style={estilos.nota}>
                Sistema: {formatearCantidad(l.stockSistema)}
                {diferencia !== 0 ? (
                  <Text style={diferencia > 0 ? estilos.sobra : estilos.falta}>
                    {'  '}
                    {diferencia > 0 ? '+' : ''}
                    {formatearCantidad(diferencia)}
                  </Text>
                ) : (
                  <Text style={estilos.igual}>{'  '}✓</Text>
                )}
              </Text>
              <Text
                accessibilityRole="button"
                style={estilos.quitar}
                onPress={() => quitar(l.productoId)}
              >
                Quitar
              </Text>
            </View>
            <CampoContado
              key={l.contado}
              nombre={l.nombre}
              valor={l.contado}
              onCambio={(contado) => fijar(l.productoId, contado)}
            />
          </View>
        );
      })}

      {lineas.length ? (
        <View style={estilos.botones}>
          <Boton
            titulo={`Aplicar conteo (${lineas.length})`}
            onPress={aplicar}
            cargando={aplicando}
          />
          <Boton titulo="Descartar conteo" variante="peligro" onPress={vaciar} />
        </View>
      ) : null}
    </Formulario>
  );
}

/**
 * Cantidad contada editable. Guarda el texto mientras se escribe (para permitir
 * "1," al escribir kilos) y lo aplica al terminar; `key` lo reinicia si la
 * cantidad cambia por un escaneo.
 */
function CampoContado({
  nombre,
  valor,
  onCambio,
}: {
  nombre: string;
  valor: number;
  onCambio: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(formatearCantidad(valor));
  const aplicar = () => {
    const numero = parsearCantidad(texto || '0');
    if (numero !== null && numero !== valor) onCambio(numero);
    else setTexto(formatearCantidad(valor));
  };
  return (
    <TextInput
      accessibilityLabel={`Contado de ${nombre}`}
      keyboardType="decimal-pad"
      value={texto}
      onChangeText={setTexto}
      onEndEditing={aplicar}
      onSubmitEditing={aplicar}
      selectTextOnFocus
      style={estilos.entrada}
    />
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  linea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  nombre: { fontSize: 16, fontWeight: '600', color: colores.texto },
  nota: { marginTop: 2, fontSize: 13, color: colores.textoSecundario },
  sobra: { color: colores.exito, fontWeight: '600' },
  falta: { color: colores.error, fontWeight: '600' },
  igual: { color: colores.exito },
  quitar: { marginTop: 4, fontSize: 13, color: colores.error },
  entrada: {
    width: 80,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: colores.texto,
  },
  resultado: { marginBottom: 12, gap: 8 },
  ok: { fontSize: 15, color: colores.exito },
  botones: { marginTop: 12, gap: 10 },
});
