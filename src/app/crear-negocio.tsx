import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { Boton } from '@/components/Boton';
import { Formulario } from '@/components/Formulario';
import { CamposNegocio } from '@/features/cuenta/CamposNegocio';
import {
  type Errores,
  type FormNegocio,
  formNegocioVacio,
  validarNegocio,
} from '@/features/cuenta/datosNegocio';
import { mensajeDeError } from '@/lib/supabase';
import { crearNegocio } from '@/sesion/cuenta';

/** Para cuentas que iniciaron sesión pero aún no tienen negocio. */
export default function CrearNegocioScreen() {
  const db = useSQLiteContext();
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
      await crearNegocio(db, form);
    } catch (e) {
      setError(mensajeDeError(e));
      setCargando(false);
    }
  };

  return (
    <Formulario titulo="Datos del negocio" error={error}>
      <CamposNegocio
        form={form}
        errores={errores}
        onCambio={(cambios) => setForm((f) => ({ ...f, ...cambios }))}
      />
      <Boton titulo="Crear negocio" onPress={enviar} cargando={cargando} />
    </Formulario>
  );
}
