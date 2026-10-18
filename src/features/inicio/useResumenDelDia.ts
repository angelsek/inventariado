import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { obtenerCajaAbierta } from '@/db/cajas';
import { obtenerNegocio } from '@/db/negocio';
import { listarProductos } from '@/db/productos';
import { useBase } from '@/db/proveedor';
import { resumirVentas } from '@/db/ventas';
import { rangoDelDia } from '@/lib/fechas';
import { obtenerAutor } from '@/sesion/autor';
import { useSesion } from '@/sesion/store';

export type ResumenDelDia = {
  negocio: string;
  ventasHoy: number;
  cantidadHoy: number;
  stockBajo: number;
  sinStock: number;
  cajaAbierta: boolean;
};

/**
 * Resumen del día para Inicio (teléfono) y Resumen de hoy (PC): ventas de hoy, stock bajo,
 * sin stock y si este equipo tiene la caja abierta. Se recarga al volver a la pantalla y cuando
 * llegan datos de otros equipos.
 */
export function useResumenDelDia(): ResumenDelDia | null {
  const db = useBase();
  const { negocioId, versionDatos } = useSesion();
  const [resumen, setResumen] = useState<ResumenDelDia | null>(null);

  const cargar = useCallback(() => {
    if (!negocioId) return;
    const { desde, hasta } = rangoDelDia(new Date());
    Promise.all([
      obtenerNegocio(db, negocioId),
      resumirVentas(db, negocioId, desde, hasta),
      listarProductos(db, negocioId),
      obtenerAutor(db).then(({ dispositivoId }) =>
        obtenerCajaAbierta(db, negocioId, dispositivoId),
      ),
    ]).then(([negocio, ventas, productos, caja]) =>
      setResumen({
        negocio: negocio?.nombre ?? '',
        ventasHoy: ventas.total,
        cantidadHoy: ventas.cantidad,
        sinStock: productos.filter((p) => p.stock <= 0).length,
        stockBajo: productos.filter(
          (p) => p.stock > 0 && p.stockMinimo > 0 && p.stock <= p.stockMinimo,
        ).length,
        cajaAbierta: !!caja,
      }),
    );
  }, [db, negocioId]);

  useFocusEffect(cargar);
  useEffect(cargar, [cargar, versionDatos]);

  return resumen;
}
