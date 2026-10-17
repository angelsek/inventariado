import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { create } from 'zustand';

import { Boton } from '@/components/Boton';
import { colores, radios } from '@/theme/colores';

import type { BotonDialogo } from './dialogo';

export type { BotonDialogo } from './dialogo';

type Dialogo = { titulo: string; mensaje?: string; botones: BotonDialogo[] };

const useDialogos = create<{ cola: Dialogo[] }>(() => ({ cola: [] }));

/** Escritorio: encola el aviso; HostDialogos lo muestra en un modal propio. */
export function avisar(titulo: string, mensaje?: string, botones?: BotonDialogo[]): void {
  const lista = botones?.length ? botones : [{ text: 'Aceptar' }];
  useDialogos.setState((s) => ({ cola: [...s.cola, { titulo, mensaje, botones: lista }] }));
}

/** true si hay un aviso abierto: los atajos de la caja esperan a que se cierre. */
export function hayDialogoAbierto(): boolean {
  return useDialogos.getState().cola.length > 0;
}

function cerrar(boton?: BotonDialogo) {
  useDialogos.setState((s) => ({ cola: s.cola.slice(1) }));
  boton?.onPress?.();
}

/** Va una vez en la raíz de la app (src/app/_layout.tsx). */
export function HostDialogos() {
  const actual = useDialogos((s) => s.cola[0]);

  // Esc equivale al botón de cancelar (como el botón Atrás en Android).
  useEffect(() => {
    if (!actual) return;
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      evento.preventDefault();
      cerrar(actual.botones.find((b) => b.style === 'cancel'));
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [actual]);

  if (!actual) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => cerrar()}>
      <View style={estilos.fondo}>
        <View accessibilityRole="alert" style={estilos.tarjeta}>
          <Text style={estilos.titulo}>{actual.titulo}</Text>
          {actual.mensaje ? <Text style={estilos.mensaje}>{actual.mensaje}</Text> : null}
          <View style={estilos.botones}>
            {actual.botones.map((boton, i) => (
              <Boton
                key={`${boton.text}-${i}`}
                titulo={boton.text ?? 'Aceptar'}
                variante={
                  boton.style === 'destructive'
                    ? 'peligro'
                    : boton.style === 'cancel'
                      ? 'secundario'
                      : 'primario'
                }
                onPress={() => cerrar(boton)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tarjeta: {
    width: '100%',
    maxWidth: 460,
    gap: 12,
    padding: 24,
    borderRadius: radios.grande,
    backgroundColor: colores.superficie,
  },
  titulo: { fontSize: 20, fontWeight: '700', color: colores.texto },
  mensaje: { fontSize: 16, lineHeight: 22, color: colores.textoSecundario },
  botones: { gap: 10, marginTop: 8 },
});
