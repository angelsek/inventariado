import { GRUPOS_PERMISOS, PERMISOS, PERMISOS_INICIALES } from '../catalogo';
import {
  esPermiso,
  parsearPermisos,
  PERMISO_POR_RUTA,
  permisosDePerfil,
  puedeAbrir,
} from '../permisos';

const { readFileSync } = require('node:fs') as {
  readFileSync(ruta: string, codificacion: 'utf8'): string;
};

// Una persona con los permisos con que parte al agregarla.
const CAJERO = PERMISOS_INICIALES;

describe('permisosDePerfil', () => {
  it('el dueño siempre tiene todo, aunque su lista guardada esté vacía', () => {
    expect(permisosDePerfil({ rol: 'dueno', permisos: [] })).toEqual([...PERMISOS]);
    expect(permisosDePerfil({ rol: 'dueno', permisos: ['vender'] })).toEqual([...PERMISOS]);
  });

  it('las demás personas tienen solo su lista', () => {
    expect(permisosDePerfil({ rol: 'cajero', permisos: ['vender', 'caja'] })).toEqual([
      'vender',
      'caja',
    ]);
  });

  it('una lista vacía no da nada (no cae a los permisos iniciales)', () => {
    expect(permisosDePerfil({ rol: 'cajero', permisos: [] })).toEqual([]);
  });

  it('entrega los permisos en el orden del catálogo, sin repetir ni claves desconocidas', () => {
    expect(
      permisosDePerfil({ rol: 'cajero', permisos: ['reportes', 'stock', 'stock', 'xx'] as never }),
    ).toEqual(['stock', 'reportes']);
  });

  it('devuelve una copia: modificar el resultado no cambia el perfil ni el catálogo', () => {
    const perfil = { rol: 'cajero', permisos: ['vender'] as const };
    permisosDePerfil(perfil).push('usuarios');
    expect(perfil.permisos).toEqual(['vender']);
    permisosDePerfil({ rol: 'dueno', permisos: [] }).pop();
    expect(PERMISOS).toHaveLength(15);
  });
});

describe('parsearPermisos', () => {
  it('lee un arreglo JSON en texto', () => {
    expect(parsearPermisos('["caja","vender"]')).toEqual(['vender', 'caja']);
  });

  it('acepta un arreglo ya parseado', () => {
    expect(parsearPermisos(['stock'])).toEqual(['stock']);
  });

  it('JSON inválido devuelve vacío', () => {
    expect(parsearPermisos('{no es json')).toEqual([]);
    expect(parsearPermisos('')).toEqual([]);
  });

  it('lo que no es arreglo devuelve vacío', () => {
    expect(parsearPermisos('{"vender":true}')).toEqual([]);
    expect(parsearPermisos('"vender"')).toEqual([]);
    expect(parsearPermisos('null')).toEqual([]);
    expect(parsearPermisos(null)).toEqual([]);
    expect(parsearPermisos(undefined)).toEqual([]);
    expect(parsearPermisos(5)).toEqual([]);
  });

  it('quita repetidos, claves desconocidas y valores que no son texto', () => {
    expect(parsearPermisos('["vender","vender","xx",3,null,"caja"]')).toEqual(['vender', 'caja']);
  });
});

describe('esPermiso', () => {
  it('solo acepta claves del catálogo', () => {
    expect(esPermiso('vender')).toBe(true);
    expect(esPermiso('toString')).toBe(false);
    expect(esPermiso(1)).toBe(false);
  });
});

describe('puedeAbrir', () => {
  it('rutas libres las abre cualquiera, incluso sin permisos', () => {
    expect(puedeAbrir('/', [])).toBe(true);
    expect(puedeAbrir('/inventario', [])).toBe(true);
    expect(puedeAbrir('/mas', [])).toBe(true);
    expect(puedeAbrir('/producto/abc', [])).toBe(true);
    expect(puedeAbrir('/suscripcion', [])).toBe(true);
  });

  it('una ruta protegida pide su permiso', () => {
    expect(puedeAbrir('/estadisticas', [])).toBe(false);
    expect(puedeAbrir('/estadisticas', ['reportes'])).toBe(true);
    expect(puedeAbrir('/estadisticas', CAJERO)).toBe(false);
  });

  it('compara el primer segmento: ids y subrutas', () => {
    expect(puedeAbrir('/venta/123', ['caja'])).toBe(false);
    expect(puedeAbrir('/venta/123', ['ventas_ver'])).toBe(true);
    // Quien vende ve el comprobante de la venta recién cobrada, pero no la lista.
    expect(puedeAbrir('/venta/123', ['vender'])).toBe(true);
    expect(puedeAbrir('/ventas', ['vender'])).toBe(false);
    expect(puedeAbrir('/cliente/9f2', ['fiado'])).toBe(true);
    expect(puedeAbrir('/cliente/9f2', [])).toBe(false);
  });

  it('ignora el query string y las barras finales', () => {
    expect(puedeAbrir('/caja?x=1', ['caja'])).toBe(true);
    expect(puedeAbrir('/caja?x=1', [])).toBe(false);
    expect(puedeAbrir('/usuarios/', ['usuarios'])).toBe(true);
    expect(puedeAbrir('/venta/1?a=/usuarios', [])).toBe(false);
  });

  it('/usuarios y /usuario/x piden "usuarios"', () => {
    for (const ruta of ['/usuarios', '/usuario/nuevo', '/usuario/abc']) {
      expect(puedeAbrir(ruta, [])).toBe(false);
      expect(puedeAbrir(ruta, CAJERO)).toBe(false);
      expect(puedeAbrir(ruta, ['reportes'])).toBe(false);
      expect(puedeAbrir(ruta, ['usuarios'])).toBe(true);
    }
    expect(PERMISO_POR_RUTA['/usuarios']).toEqual(['usuarios']);
    expect(PERMISO_POR_RUTA['/usuario']).toEqual(['usuarios']);
  });

  it('las pantallas de roles ya no existen: sus rutas no piden permiso', () => {
    expect(PERMISO_POR_RUTA['/roles']).toBeUndefined();
    expect(PERMISO_POR_RUTA['/rol']).toBeUndefined();
  });

  it('con varias opciones basta una', () => {
    expect(puedeAbrir('/clientes', ['fiado'])).toBe(true);
    expect(puedeAbrir('/clientes', ['clientes_editar'])).toBe(true);
    expect(puedeAbrir('/clientes', ['stock'])).toBe(false);
  });

  it('no confunde rutas que comparten prefijo', () => {
    expect(puedeAbrir('/compras', [])).toBe(false);
    expect(puedeAbrir('/comprasX', [])).toBe(true);
    expect(puedeAbrir('/constructor', [])).toBe(true);
  });

  it('una persona con los permisos iniciales no llega a reportes, negocio, exportar ni usuarios', () => {
    for (const ruta of ['/estadisticas', '/negocio', '/exportar', '/usuarios']) {
      expect(puedeAbrir(ruta, CAJERO)).toBe(false);
    }
    for (const ruta of [
      '/vender',
      '/cobrar',
      '/caja',
      '/ventas',
      '/clientes',
      '/compra',
      '/conteo',
    ]) {
      expect(puedeAbrir(ruta, CAJERO)).toBe(true);
    }
  });

  it('con todos los permisos abre todas las rutas protegidas', () => {
    for (const ruta of Object.keys(PERMISO_POR_RUTA)) {
      expect(puedeAbrir(ruta, PERMISOS)).toBe(true);
    }
  });
});

describe('catálogo', () => {
  it('todas las claves de PERMISO_POR_RUTA son permisos válidos', () => {
    for (const [ruta, claves] of Object.entries(PERMISO_POR_RUTA)) {
      expect(ruta.startsWith('/')).toBe(true);
      expect(claves.length).toBeGreaterThan(0);
      for (const clave of claves) expect(esPermiso(clave)).toBe(true);
    }
  });

  it('los permisos del catálogo no se repiten', () => {
    expect(new Set(PERMISOS).size).toBe(PERMISOS.length);
  });

  it('los permisos iniciales son válidos, no se repiten y no incluyen los delicados', () => {
    expect(new Set(PERMISOS_INICIALES).size).toBe(PERMISOS_INICIALES.length);
    for (const clave of PERMISOS_INICIALES) expect(esPermiso(clave)).toBe(true);
    expect(PERMISOS_INICIALES).toEqual([
      'vender',
      'ventas_ver',
      'caja',
      'fiado',
      'productos_editar',
      'mercaderia',
      'stock',
    ]);
    for (const delicado of ['usuarios', 'cuenta_eliminar', 'suscripcion', 'negocio'] as const) {
      expect(PERMISOS_INICIALES).not.toContain(delicado);
    }
  });

  it('cada permiso aparece una vez en los grupos que ve el dueño', () => {
    const claves = GRUPOS_PERMISOS.flatMap((g) => g.permisos.map((p) => p.clave));
    expect([...claves].sort()).toEqual([...PERMISOS].sort());
  });
});

describe('permisos iniciales y la migración SQL', () => {
  // Jest corre desde la raíz del proyecto.
  const sql: string = readFileSync(
    'supabase/migrations/20261021000100_permisos_por_persona.sql',
    'utf8',
  );

  it('el valor por defecto del servidor coincide con PERMISOS_INICIALES', () => {
    const coincide = sql.match(/set default\s+'(\[[^']*\])'::jsonb/i);
    if (!coincide) throw new Error('No se encontró el valor por defecto en la migración');
    expect(JSON.parse(coincide[1])).toEqual([...PERMISOS_INICIALES]);
  });
});
