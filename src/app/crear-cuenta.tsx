import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { Boton } from '@/components/Boton';
import { Campo } from '@/components/Campo';
import { Formulario } from '@/components/Formulario';
import { CamposNegocio } from '@/features/cuenta/CamposNegocio';
import {
  type Errores,
  type FormNegocio,
  formNegocioVacio,
  validarNegocio,
} from '@/features/cuenta/datosNegocio';
import { mensajeDeError } from '@/lib/supabase';
import { esCorreoValido } from '@/lib/validacion';
import { crearCuentaYNegocio } from '@/sesion/cuenta';

type Form = FormNegocio & { correo: string; contrasena: string };

export default function CrearCuentaScreen() {
  const db = useSQLiteContext();
  const [form, setForm] = useState<Form>({ ...formNegocioVacio, correo: '', contrasena: '' });
  const [errores, setErrores] = useState<Errores<Form>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cambiar = (cambios: Partial<Form>) => setForm((f) => ({ ...f, ...cambios }));

  const enviar = async () => {
    const nuevos: Errores<Form> = validarNegocio(form);
    if (!esCorreoValido(form.correo)) nuevos.correo = 'Ingresa un correo válido.';
    if (form.contrasena.length < 6) nuevos.contrasena = 'Usa al menos 6 caracteres.';
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setCargando(true);
    setError(null);
    try {
      const resultado = await crearCuentaYNegocio(db, form.correo, form.contrasena, form);
      if (resultado.tipo === 'confirmar_correo' || resultado.tipo === 'cuenta_existente') {
        const aviso = resultado.tipo === 'confirmar_correo' ? 'confirmar' : 'existente';
        router.replace({ pathname: '/ingresar', params: { aviso, correo: form.correo.trim() } });
      }
      // 'listo': la navegación cambia sola al vincularse el negocio.
    } catch (e) {
      setError(mensajeDeError(e));
      setCargando(false);
    }
  };

  return (
    <Formulario
      titulo="Crea tu negocio"
      subtitulo="Con esta cuenta podrás usar la app en todos los teléfonos de tu local."
      error={error}
    >
      <Campo
        etiqueta="Correo"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={form.correo}
        onChangeText={(correo) => cambiar({ correo })}
        error={errores.correo}
      />
      <Campo
        etiqueta="Contraseña"
        secureTextEntry
        autoComplete="new-password"
        value={form.contrasena}
        onChangeText={(contrasena) => cambiar({ contrasena })}
        error={errores.contrasena}
      />
      <CamposNegocio form={form} errores={errores} onCambio={cambiar} />
      <Boton titulo="Crear cuenta" onPress={enviar} cargando={cargando} />
    </Formulario>
  );
}
