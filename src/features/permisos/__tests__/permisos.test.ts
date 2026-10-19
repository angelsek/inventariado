import { PERMISOS, ROLES_PREDEFINIDOS } from '../catalogo';
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

const CAJERO = ROLES_PREDEFINIDOS.cajero.permisos;

describe('permisosDePerfil', () => {
  it('el dueño siempre tiene todo, aunque tenga un rol o este eliminado', () => {
    expect(permisosDePerfil({ rol: 'dueno' }, null)).toEqual([...PERMISOS]);
    expect(permisosDePerfil({ rol: 'dueno' }, { permisos: [], eliminado: false })).toEqual([
      ...PERMISOS,
    ]);
    expect(permisosDePerfil({ rol: 'dueno' }, { permisos: ['vender'], eliminado: true })).toEqual([
      ...PERMISOS,
    ]);
  });

  it('sin rol tiene los permisos del Cajero', () => {
    expect(permisosDePerfil({ rol: 'cajero' }, null)).toEqual(CAJERO);
  });

  it('con el rol eliminado vuelve a los permisos del Cajero', () => {
    const rol = { permisos: [...PERMISOS], eliminado: true };
    expect(permisosDePerfil({ rol: 'cajero' }, rol)).toEqual(CAJERO);
  });

  it('devuelve una copia: modificar el resultado no cambia el Cajero predefinido', () => {
    permisosDePerfil({ rol: 'cajero' }, null).push('usuarios');
    expect(ROLES_PREDEFINIDOS.cajero.permisos).not.toContain('usuarios');
  });

  it('usa los permisos del rol y los entrega en el orden del catálogo', () => {
    const rol = { permisos: ['stock', 'reportes'] as const, eliminado: false };
    expect(permisosDePerfil({ rol: 'cajero' }, rol)).toEqual(['stock', 'reportes']);
  });

  it('ignora claves desconocidas', () => {
    const rol = { permisos: ['vender', 'inventada'] as never, eliminado: false };
    expect(permisosDePerfil({ rol: 'cajero' }, rol)).toEqual(['vender']);
  });

  it('un rol sin permisos no da nada (no cae al Cajero)', () => {
    expect(permisosDePerfil({ rol: 'cajero' }, { permisos: [], eliminado: false })).toEqual([]);
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
    expect(puedeAbrir('/venta/123', ['vender'])).toBe(false);
    expect(puedeAbrir('/venta/123', ['ventas_ver'])).toBe(true);
    expect(puedeAbrir('/cliente/9f2', ['fiado'])).toBe(true);
    expect(puedeAbrir('/cliente/9f2', [])).toBe(false);
  });

  it('ignora el query string y las barras finales', () => {
    expect(puedeAbrir('/caja?x=1', ['caja'])).toBe(true);
    expect(puedeAbrir('/caja?x=1', [])).toBe(false);
    expect(puedeAbrir('/usuarios/', ['usuarios'])).toBe(true);
    expect(puedeAbrir('/venta/1?a=/usuarios', [])).toBe(false);
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

  it('un Cajero predefinido no llega a reportes, negocio, exportar, compras ni usuarios', () => {
    for (const ruta of ['/estadisticas', '/negocio', '/exportar', '/compra', '/usuarios']) {
      expect(puedeAbrir(ruta, CAJERO)).toBe(false);
    }
    for (const ruta of ['/vender', '/cobrar', '/caja', '/ventas', '/clientes']) {
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

  it('todo rol predefinido usa solo permisos válidos', () => {
    for (const rol of Object.values(ROLES_PREDEFINIDOS)) {
      for (const clave of rol.permisos) expect(esPermiso(clave)).toBe(true);
    }
    expect(ROLES_PREDEFINIDOS.administrador.permisos).toEqual([...PERMISOS]);
  });
});

describe('roles predefinidos y la migración SQL', () => {
  // Jest corre desde la raíz del proyecto.
  const sql: string = readFileSync('supabase/migrations/20261019000100_roles_permisos.sql', 'utf8');
  // Fragmento del insert de crear_roles_predefinidos.
  const inicio = sql.indexOf('create or replace function inventariado.crear_roles_predefinidos');
  const insercion = sql.slice(inicio, sql.indexOf('$$;', sql.indexOf('as $$', inicio) + 5));

  const permisosEnSql = (predefinido: string): string[] => {
    const re = new RegExp("'(\\[[^']*\\])'::jsonb,\\s*'" + predefinido + "'");
    const coincide = insercion.match(re);
    if (!coincide) throw new Error(`No se encontró el rol ${predefinido} en la migración`);
    return JSON.parse(coincide[1]);
  };

  it.each(['administrador', 'cajero', 'bodeguero'] as const)(
    'el rol %s tiene los mismos permisos en la app y en el SQL',
    (clave) => {
      expect(permisosEnSql(clave)).toEqual(ROLES_PREDEFINIDOS[clave].permisos);
    },
  );

  it.each([
    ['administrador', 'Administrador'],
    ['cajero', 'Cajero'],
    ['bodeguero', 'Bodeguero'],
  ] as const)('el nombre del rol %s coincide', (clave, nombre) => {
    expect(ROLES_PREDEFINIDOS[clave].nombre).toBe(nombre);
    expect(insercion).toContain(`'${nombre}'`);
  });
});
