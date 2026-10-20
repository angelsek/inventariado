import { type Permiso, PERMISOS, ROLES_PREDEFINIDOS } from '../catalogo';
import {
  type Editor,
  editorDe,
  LARGO_MAXIMO_NOMBRE_ROL,
  normalizarNombreRol,
  ordenarPermisos,
  permisoEditable,
  puedeEditarRol,
  puedeRestablecer,
  resumirPermisos,
  rolesAsignables,
  validarNombreRol,
} from '../edicionRoles';

const rol = (id: string, nombre: string, eliminado = false) => ({ id, nombre, eliminado });

const DUENO: Editor = { esDueno: true, rolId: null, permisos: PERMISOS };
const editor = (permisos: Permiso[], rolId: string | null = 'mio'): Editor => ({
  esDueno: false,
  rolId,
  permisos,
});

describe('normalizarNombreRol', () => {
  it('quita espacios de los bordes y junta los repetidos', () => {
    expect(normalizarNombreRol('  Jefe   de   turno ')).toBe('Jefe de turno');
    expect(normalizarNombreRol('a\t\nb')).toBe('a b');
    expect(normalizarNombreRol('   ')).toBe('');
  });
});

describe('validarNombreRol', () => {
  const roles = [rol('1', 'Cajero'), rol('2', 'Ñandú'), rol('3', 'Viejo', true)];

  it('acepta un nombre nuevo', () => {
    expect(validarNombreRol('Supervisor', roles, null)).toBeNull();
  });

  it('rechaza vacío o solo espacios', () => {
    expect(validarNombreRol('', roles, null)).toMatch(/Ingresa el nombre/);
    expect(validarNombreRol('   ', roles, null)).toMatch(/Ingresa el nombre/);
  });

  it('acepta justo 40 letras y rechaza 41 (después de normalizar)', () => {
    expect(validarNombreRol('a'.repeat(LARGO_MAXIMO_NOMBRE_ROL), roles, null)).toBeNull();
    expect(validarNombreRol('a'.repeat(LARGO_MAXIMO_NOMBRE_ROL + 1), roles, null)).toMatch(/40/);
    expect(validarNombreRol(`  ${'a'.repeat(40)}  `, roles, null)).toBeNull();
  });

  it.each(['Dueño', 'dueño', 'DUEÑO', ' Dueno ', 'DUENO'])('reserva "%s"', (nombre) => {
    expect(validarNombreRol(nombre, roles, null)).toMatch(/reservado/);
  });

  it('rechaza repetidos sin importar mayúsculas ni espacios, también con Ñ', () => {
    expect(validarNombreRol('cajero', roles, null)).toMatch(/Ya existe/);
    expect(validarNombreRol('  CAJERO ', roles, null)).toMatch(/"Cajero"/);
    expect(validarNombreRol('ÑANDÚ', roles, null)).toMatch(/Ya existe/);
  });

  it('Ñandú y Nandu son nombres distintos', () => {
    expect(validarNombreRol('Nandu', roles, null)).toBeNull();
  });

  it('ignora los roles eliminados', () => {
    expect(validarNombreRol('Viejo', roles, null)).toBeNull();
  });

  it('ignora el propio rol que se edita pero no otros', () => {
    expect(validarNombreRol('Cajero', roles, '1')).toBeNull();
    expect(validarNombreRol('Cajero', roles, '2')).toMatch(/Ya existe/);
  });
});

describe('ordenarPermisos', () => {
  it('ordena como el catálogo, sin repetidos ni claves desconocidas', () => {
    expect(ordenarPermisos(['stock', 'vender', 'stock', 'inventada'])).toEqual(['vender', 'stock']);
  });

  it('vacío devuelve vacío', () => {
    expect(ordenarPermisos([])).toEqual([]);
  });
});

describe('permisoEditable', () => {
  it('el dueño edita todos', () => {
    expect(permisoEditable('cuenta_eliminar', DUENO)).toBe(true);
  });
  it('los demás solo los que tienen', () => {
    const e = editor(['vender']);
    expect(permisoEditable('vender', e)).toBe(true);
    expect(permisoEditable('stock', e)).toBe(false);
  });
});

describe('puedeEditarRol', () => {
  const ajeno = { id: 'otro', permisos: ['vender'] as Permiso[] };

  it('el dueño edita cualquier rol, incluso con el mismo id', () => {
    expect(puedeEditarRol({ id: 'x', permisos: [...PERMISOS] }, { ...DUENO, rolId: 'x' })).toEqual({
      editable: true,
    });
  });

  it('nadie más cambia su propio rol', () => {
    const r = puedeEditarRol({ id: 'mio', permisos: ['vender'] }, editor(['vender', 'usuarios']));
    expect(r.editable).toBe(false);
    expect(r.motivo).toMatch(/propio rol/);
  });

  it('puede editar un rol con permisos que incluye', () => {
    expect(puedeEditarRol(ajeno, editor(['vender', 'usuarios'])).editable).toBe(true);
  });

  it('no edita un rol con permisos que no tiene', () => {
    const r = puedeEditarRol(
      { id: 'otro', permisos: ['vender', 'stock'] },
      editor(['vender', 'usuarios']),
    );
    expect(r.editable).toBe(false);
    expect(r.motivo).toMatch(/que tú no tienes/);
  });

  it('un rol sin permisos lo puede editar cualquiera con acceso', () => {
    expect(puedeEditarRol({ id: 'otro', permisos: [] }, editor([])).editable).toBe(true);
  });

  it('con rolId null no se confunde con ningún rol', () => {
    expect(puedeEditarRol(ajeno, editor(['vender'], null)).editable).toBe(true);
  });
});

describe('puedeRestablecer', () => {
  const adminRol = { id: 'adm', permisos: [...PERMISOS], predefinido: 'administrador' as const };
  const bodega = { id: 'bod', permisos: [] as Permiso[], predefinido: 'bodeguero' as const };

  it('un rol propio no se restablece', () => {
    expect(puedeRestablecer({ id: 'a', permisos: [], predefinido: null }, DUENO)).toBe(false);
  });

  it('el dueño restablece los predefinidos', () => {
    expect(puedeRestablecer(adminRol, DUENO)).toBe(true);
    expect(puedeRestablecer(bodega, DUENO)).toBe(true);
  });

  it('exige poder editar el rol', () => {
    expect(puedeRestablecer(bodega, editor(ROLES_PREDEFINIDOS.bodeguero.permisos, 'bod'))).toBe(
      false,
    );
  });

  it('exige tener todos los permisos de fábrica del rol', () => {
    expect(puedeRestablecer(bodega, editor(['productos_editar']))).toBe(false);
    expect(puedeRestablecer(bodega, editor(ROLES_PREDEFINIDOS.bodeguero.permisos))).toBe(true);
  });
});

describe('rolesAsignables', () => {
  const roles = [
    { id: 'a', permisos: ['vender'] as Permiso[] },
    { id: 'b', permisos: ['vender', 'stock'] as Permiso[] },
    { id: 'c', permisos: [] as Permiso[] },
  ];

  it('el dueño asigna todos', () => {
    expect(rolesAsignables(roles, DUENO)).toHaveLength(3);
  });

  it('los demás solo los que no dan más que ellos (incluye el vacío)', () => {
    expect(rolesAsignables(roles, editor(['vender'])).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('sin permisos solo asigna roles vacíos', () => {
    expect(rolesAsignables(roles, editor([])).map((r) => r.id)).toEqual(['c']);
  });
});

describe('resumirPermisos', () => {
  it('lista los textos en el orden de los grupos', () => {
    expect(resumirPermisos({ permisos: ['stock', 'vender'] })).toBe(
      'Vender y cobrar · Conteo de stock',
    );
  });
  it('sin permisos dice que solo ve productos', () => {
    expect(resumirPermisos({ permisos: [] })).toBe('Solo ver productos');
  });
});

describe('editorDe', () => {
  const roles = [
    { id: 'caj', predefinido: 'cajero' as const },
    { id: 'adm', predefinido: 'administrador' as const },
    { id: 'x', predefinido: null },
  ];

  it('el dueño es dueño', () => {
    expect(editorDe({ rol: 'dueno', rol_id: null }, roles, PERMISOS).esDueno).toBe(true);
  });

  it('con rol vigente usa ese rol', () => {
    expect(editorDe({ rol: 'cajero', rol_id: 'adm' }, roles, ['usuarios'])).toEqual({
      esDueno: false,
      rolId: 'adm',
      permisos: ['usuarios'],
    });
  });

  it('sin rol_id o con rol eliminado/desconocido su rol es el Cajero', () => {
    expect(editorDe({ rol: 'cajero', rol_id: null }, roles, []).rolId).toBe('caj');
    expect(editorDe({ rol: 'cajero', rol_id: 'borrado' }, roles, []).rolId).toBe('caj');
  });

  it('sin Cajero entre los roles, rolId es null', () => {
    expect(editorDe({ rol: 'cajero', rol_id: 'z' }, [roles[1]], []).rolId).toBeNull();
  });
});
