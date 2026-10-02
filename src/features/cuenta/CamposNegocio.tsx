import { Campo } from '@/components/Campo';
import { LARGO_PIN } from '@/lib/pin';
import { formatearRut } from '@/lib/validacion';

import type { Errores, FormNegocio } from './datosNegocio';

type Props = {
  form: FormNegocio;
  errores: Errores<FormNegocio>;
  onCambio: (cambios: Partial<FormNegocio>) => void;
};

export function CamposNegocio({ form, errores, onCambio }: Props) {
  const soloNumeros = (texto: string) => texto.replace(/\D/g, '').slice(0, LARGO_PIN);

  return (
    <>
      <Campo
        etiqueta="Nombre del negocio"
        placeholder="Ej: Botillería Don Pepe"
        value={form.nombreNegocio}
        onChangeText={(nombreNegocio) => onCambio({ nombreNegocio })}
        error={errores.nombreNegocio}
      />
      <Campo
        etiqueta="RUT del negocio (opcional)"
        placeholder="12.345.678-5"
        autoCapitalize="characters"
        value={form.rut}
        onChangeText={(rut) => onCambio({ rut })}
        onBlur={() => form.rut && onCambio({ rut: formatearRut(form.rut) })}
        error={errores.rut}
      />
      <Campo
        etiqueta="Dirección (opcional)"
        value={form.direccion}
        onChangeText={(direccion) => onCambio({ direccion })}
      />
      <Campo
        etiqueta="Tu nombre"
        autoComplete="name"
        value={form.nombreDueno}
        onChangeText={(nombreDueno) => onCambio({ nombreDueno })}
        error={errores.nombreDueno}
      />
      <Campo
        etiqueta={`Tu PIN (${LARGO_PIN} números)`}
        ayuda="Lo usarás para entrar a la app en el local."
        keyboardType="number-pad"
        secureTextEntry
        maxLength={LARGO_PIN}
        value={form.pin}
        onChangeText={(pin) => onCambio({ pin: soloNumeros(pin) })}
        error={errores.pin}
      />
      <Campo
        etiqueta="Repite tu PIN"
        keyboardType="number-pad"
        secureTextEntry
        maxLength={LARGO_PIN}
        value={form.pinConfirmado}
        onChangeText={(pinConfirmado) => onCambio({ pinConfirmado: soloNumeros(pinConfirmado) })}
        error={errores.pinConfirmado}
      />
    </>
  );
}
