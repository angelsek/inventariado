import { type Permiso, PERMISOS, PERMISOS_INICIALES } from '../catalogo';
import {
  type Editor,
  type Objetivo,
  LARGO_MAXIMO_NOMBRE,
  normalizarNombre,
  ordenarPermisos,
  permisoEditable,
  permisosInicialesPara,
  puedeEditarPersona,
  resumirPermisos,
  validarNombre,
  validarPermisos,
} from '../edicionPersonas';

const dueno: Editor = { esDueno: true, perfilId: 'ana', permisos: [...PERMISOS] };
const gerente = (permisos: Permiso[]): Editor => ({ esDueno: false, perfilId: 'gus', permisos });
const persona = (id: string, permisos: Permiso[], rol = 'cajero'): Objetivo => ({
  id,
  rol,
  permisos,
});

describe('puedeEditarPersona', () => {
  it('el dueño edita a otra persona en todo', () => {
    expect(puedeEditarPersona(persona('beto', ['vender']), dueno)).toEqual({
      nombre: true,
      pin: true,
      activo: true,
      permisos: true,
    });
  });

  it('el dueño edita solo su nombre y PIN: no su estado ni sus permisos', () => {
    expect(puedeEditarPersona(persona('ana', [], 'dueno'), dueno)).toEqual({
      nombre: true,
      pin: true,
      activo: false,
      permisos: false,
    });
  });

  it('nadie más toca al dueño, ni con todos los permisos', () => {
    const edicion = puedeEditarPersona(persona('ana', [], 'dueno'), gerente([...PERMISOS]));
    expect(edicion).toMatchObject({ nombre: false, pin: false, activo: false, permisos: false });
    expect(edicion.motivo).toMatch(/Solo el dueño/);
  });

  it('el dueño (lista vacía) no se trata como una persona sin permisos', () => {
    const edicion = puedeEditarPersona(persona('ana', [], 'dueno'), gerente(['usuarios']));
    expect(edicion.permisos).toBe(false);
    expect(edicion.activo).toBe(false);
  });

  it('nadie cambia sus propios permisos, su nombre ni su estado, pero sí su PIN', () => {
    const yo = gerente(['usuarios', 'vender']);
    const edicion = puedeEditarPersona(persona('gus', ['usuarios', 'vender']), yo);
    expect(edicion).toMatchObject({ nombre: false, pin: true, activo: false, permisos: false });
    expect(edicion.motivo).toMatch(/propios permisos/);
  });

  it('quien tiene "usuarios" edita a quien tiene permisos que él también tiene', () => {
    const yo = gerente(['usuarios', 'vender', 'stock']);
    expect(puedeEditarPersona(persona('beto', ['vender']), yo)).toEqual({
      nombre: true,
      pin: true,
      activo: true,
      permisos: true,
    });
    expect(puedeEditarPersona(persona('sin', []), yo).permisos).toBe(true);
  });

  it('no toca a quien tiene permisos que el editor no tiene', () => {
    const yo = gerente(['usuarios', 'vender']);
    const edicion = puedeEditarPersona(persona('rosa', ['vender', 'reportes']), yo);
    expect(edicion).toMatchObject({ nombre: false, pin: false, activo: false, permisos: false });
    expect(edicion.motivo).toMatch(/permisos que tú no tienes/);
  });

  it('el dueño sí edita a quien tiene cualquier permiso', () => {
    expect(puedeEditarPersona(persona('rosa', [...PERMISOS]), dueno).permisos).toBe(true);
  });
});

describe('puedeEditarPersona entre quienes administran usuarios', () => {
  it('quien no es dueño no cambia a otra persona que también administra usuarios', () => {
    const edicion = puedeEditarPersona(
      persona('beto', ['vender', 'usuarios']),
      gerente(['vender', 'usuarios']),
    );
    expect(edicion).toMatchObject({ nombre: false, pin: false, activo: false, permisos: false });
    expect(edicion.motivo).toBe('Solo el dueño puede cambiar a quien administra usuarios.');
  });

  it('el dueño sí la cambia', () => {
    expect(puedeEditarPersona(persona('beto', ['usuarios']), dueno).permisos).toBe(true);
  });
});

describe('permisoEditable', () => {
  it('el dueño puede activar cualquiera', () => {
    for (const p of PERMISOS) expect(permisoEditable(p, dueno)).toBe(true);
  });

  it('los demás, solo los que tienen', () => {
    const yo = gerente(['usuarios', 'vender']);
    expect(permisoEditable('vender', yo)).toBe(true);
    expect(permisoEditable('reportes', yo)).toBe(false);
  });
});

describe('permisosInicialesPara', () => {
  it('el dueño da los 7 iniciales', () => {
    expect(permisosInicialesPara(dueno)).toEqual([...PERMISOS_INICIALES]);
  });

  it('recorta lo que el editor no puede dar (sin productos_editar)', () => {
    const sinEditar = PERMISOS_INICIALES.filter((p) => p !== 'productos_editar');
    const iniciales = permisosInicialesPara(gerente(sinEditar));
    expect(iniciales).not.toContain('productos_editar');
    expect(iniciales).toEqual(sinEditar);
  });

  it('un editor con "usuarios" y nada más da una lista vacía', () => {
    expect(permisosInicialesPara(gerente(['usuarios']))).toEqual([]);
  });
});

describe('validarPermisos', () => {
  it('acepta lo que el editor tiene', () => {
    expect(validarPermisos(['vender'], gerente(['vender', 'usuarios']))).toBeNull();
    expect(validarPermisos([], gerente([]))).toBeNull();
    expect(validarPermisos([...PERMISOS], dueno)).toBeNull();
  });

  it('rechaza si hay un permiso que el editor no tiene', () => {
    expect(validarPermisos(['vender', 'reportes'], gerente(['vender']))).toMatch(
      /permisos que tú tienes/,
    );
  });
});

describe('validarNombre', () => {
  it('rechaza vacío o solo espacios', () => {
    expect(validarNombre('')).toMatch(/Ingresa el nombre/);
    expect(validarNombre('    ')).toMatch(/Ingresa el nombre/);
  });

  it('acepta 40 letras y rechaza 41', () => {
    expect(validarNombre('a'.repeat(LARGO_MAXIMO_NOMBRE))).toBeNull();
    expect(validarNombre('a'.repeat(LARGO_MAXIMO_NOMBRE + 1))).toMatch(/hasta 40/);
  });

  it('cuenta el largo después de limpiar espacios', () => {
    expect(validarNombre(`  ${'a'.repeat(40)}  `)).toBeNull();
    // 20 + 6 espacios que se juntan en 1 + 20 = 41
    expect(validarNombre(`${'a'.repeat(20)}      ${'b'.repeat(20)}`)).toMatch(/hasta 40/);
    expect(validarNombre(`${'a'.repeat(19)}      ${'b'.repeat(20)}`)).toBeNull();
  });

  it('un nombre normal sirve', () => {
    expect(validarNombre('Carla Pérez')).toBeNull();
  });
});

describe('normalizarNombre', () => {
  it('quita espacios de los bordes y junta los repetidos', () => {
    expect(normalizarNombre('  Carla \t  Pérez  ')).toBe('Carla Pérez');
    expect(normalizarNombre('   ')).toBe('');
  });
});

describe('ordenarPermisos', () => {
  it('ordena como el catálogo, sin repetir ni claves desconocidas', () => {
    expect(ordenarPermisos(['stock', 'vender', 'stock', 'xx', 'caja'])).toEqual([
      'vender',
      'caja',
      'stock',
    ]);
    expect(ordenarPermisos([])).toEqual([]);
  });
});

describe('resumirPermisos', () => {
  it('el dueño tiene todos', () => {
    expect(resumirPermisos({ rol: 'dueno', permisos: [] })).toBe('Todos los permisos');
  });

  it('lista los textos en el orden de los grupos', () => {
    expect(resumirPermisos({ rol: 'cajero', permisos: ['stock', 'vender', 'caja'] })).toBe(
      'Vender y cobrar · Caja del día · Conteo de stock',
    );
  });

  it('sin permisos dice que solo ve productos', () => {
    expect(resumirPermisos({ rol: 'cajero', permisos: [] })).toBe('Solo ver productos');
  });

  it('los 7 iniciales se resumen completos', () => {
    expect(resumirPermisos({ rol: 'cajero', permisos: [...PERMISOS_INICIALES] })).toBe(
      'Vender y cobrar · Ver ventas anteriores · Caja del día · Clientes y fiado · Editar productos · Ingresos de mercadería · Conteo de stock',
    );
  });
});
