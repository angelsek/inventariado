/**
 * Permisos que el dueño puede dar a cada persona. Las claves se guardan en
 * `perfiles.permisos`: nunca se renombra una clave publicada, solo se agregan nuevas. Ver productos y stock, Inicio y "Cambiar de usuario" no
 * necesitan permiso.
 */
export const PERMISOS = [
  'vender',
  'ventas_ver',
  'ventas_anular',
  'caja',
  'fiado',
  'clientes_editar',
  'productos_editar',
  'mercaderia',
  'stock',
  'reportes',
  'exportar',
  'negocio',
  'usuarios',
  'suscripcion',
  'cuenta_eliminar',
] as const;

export type Permiso = (typeof PERMISOS)[number];

export type GrupoPermisos = {
  titulo: string;
  permisos: { clave: Permiso; texto: string; detalle: string }[];
};

/** Textos para el dueño, agrupados como en el menú. */
export const GRUPOS_PERMISOS: GrupoPermisos[] = [
  {
    titulo: 'Caja',
    permisos: [
      { clave: 'vender', texto: 'Vender y cobrar', detalle: 'Usar la pantalla Vender.' },
      {
        clave: 'ventas_ver',
        texto: 'Ver ventas anteriores',
        detalle: 'Lista y detalle de ventas.',
      },
      { clave: 'ventas_anular', texto: 'Anular ventas', detalle: 'Devuelve el stock y el dinero.' },
      {
        clave: 'caja',
        texto: 'Caja del día',
        detalle: 'Abrir y cerrar caja, ingresos y retiros.',
      },
    ],
  },
  {
    titulo: 'Clientes',
    permisos: [
      {
        clave: 'fiado',
        texto: 'Clientes y fiado',
        detalle: 'Ver clientes, vender fiado y recibir abonos.',
      },
      {
        clave: 'clientes_editar',
        texto: 'Editar clientes',
        detalle: 'Cambiar los datos y el límite de fiado de los clientes.',
      },
    ],
  },
  {
    titulo: 'Inventario',
    permisos: [
      {
        clave: 'productos_editar',
        texto: 'Editar productos',
        detalle: 'Crear y editar productos, precios y categorías, e importar.',
      },
      {
        clave: 'mercaderia',
        texto: 'Ingresos de mercadería',
        detalle: 'Registrar compras y proveedores.',
      },
      { clave: 'stock', texto: 'Conteo de stock', detalle: 'Contar stock y ver por reponer.' },
    ],
  },
  {
    titulo: 'Reportes',
    permisos: [
      {
        clave: 'reportes',
        texto: 'Reportes del negocio',
        detalle: 'Totales y ganancias del negocio.',
      },
      { clave: 'exportar', texto: 'Exportar datos', detalle: 'Descargar los datos en planillas.' },
    ],
  },
  {
    titulo: 'Configuración',
    permisos: [
      {
        clave: 'negocio',
        texto: 'Datos del negocio',
        detalle: 'Nombre, RUT, dirección y horario de alcohol.',
      },
      {
        clave: 'usuarios',
        texto: 'Usuarios y permisos',
        detalle: 'Agregar personas, cambiar su PIN y sus permisos.',
      },
      {
        clave: 'suscripcion',
        texto: 'Suscripción y equipos',
        detalle: 'Pagar el plan y desvincular equipos.',
      },
      {
        clave: 'cuenta_eliminar',
        texto: 'Eliminar cuenta',
        detalle: 'Borra todos los datos. Igual pide la contraseña de la cuenta.',
      },
    ],
  },
];

/**
 * Permisos con que parte una persona nueva: lo típico de un almacén de barrio, donde quien
 * cobra también ingresa mercadería y cuenta stock. El dueño los cambia con interruptores.
 * El servidor usa la misma lista como valor por defecto
 * (supabase/migrations/20261021000100_permisos_por_persona.sql).
 */
export const PERMISOS_INICIALES: readonly Permiso[] = [
  'vender',
  'ventas_ver',
  'caja',
  'fiado',
  'productos_editar',
  'mercaderia',
  'stock',
];
