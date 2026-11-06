import { useState } from 'react';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import { useBase } from '@/db/proveedor';
import { CamposNegocio } from '@/features/cuenta/CamposNegocio';
import {
  type Errores,
  type FormNegocio,
  formNegocioVacio,
  validarNegocio,
} from '@/features/cuenta/datosNegocio';
import { mensajeDeError } from '@/lib/supabase';
import { agregarLocal } from '@/sesion/cuenta';

/** El dueño agrega otro local a su cuenta y se cambia a él. */
export default function NuevoLocalScreen() {
  const db = useBase();
  const [form, setForm] = useState<FormNegocio>(formNegocioVacio);
  const [errores, setErrores] = useState<Errores<FormNegocio>>({});
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const enviar = async () => {
    const nuevos = validarNegocio(form);
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) return;

    setCargando(true);
    setError(null);
    try {
      await agregarLocal(db, form);
    } catch (e) {
      setError(mensajeDeError(e));
      setCargando(false);
    }
  };

  return (
    <Formulario
      titulo="Agregar local"
      subtitulo="Cada local tiene su propia suscripción y su propio PIN de dueño. Necesitas internet."
      error={error}
    >
      <CamposNegocio
        form={form}
        errores={errores}
        onCambio={(cambios) => setForm((f) => ({ ...f, ...cambios }))}
      />
      <Boton titulo="Crear local y cambiar a él" onPress={enviar} cargando={cargando} />
    </Formulario>
  );
}
