import {
  AJUSTE_DISPOSITIVO,
  AJUSTE_LOCAL_ORIGEN,
  AJUSTE_NEGOCIO,
  AJUSTE_ULTIMO_LOCAL,
  guardarAjuste,
  leerAjuste,
} from '@/db/ajustes';
import { migrarBaseDeDatos } from '@/db/migraciones';
import type { Perfil } from '@/db/perfiles';
import type { BaseLocal } from '@/db/tipos';
import { crearBaseEnMemoria } from '@/test/baseEnMemoria';
import { respuestasRpc, respuestasTabla, supabase } from '@/test/mockSupabase';

import {
  agregarLocal,
  asignarPersonaALocal,
  cambiarDeLocal,
  iniciarSesion,
  listarLocales,
  LocalCreadoSinCambio,
} from '../cuenta';
import { useSesion } from '../store';

jest.mock('@/lib/supabase', () => require('@/test/mockSupabase'));
jest.mock('expo-crypto', () => require('@/test/mockExpoCrypto'));
const mockSincronizar = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockContarPendientes = jest.fn((..._args: unknown[]) => Promise.resolve(0));
jest.mock('@/sync/motor', () => ({
  sincronizar: (...args: unknown[]) => mockSincronizar(...args),
  contarPendientes: (...args: unknown[]) => mockContarPendientes(...args),
}));
jest.mock('@/sync/remotoSupabase', () => ({ remotoSupabase: {} }));
jest.mock('../idTelefono', () => ({ idTelefonoEstable: () => Promise.resolve('id-equipo') }));

const LOCAL_1 = 'local-1';
const LOCAL_2 = 'local-2';

const dueno: Perfil = {
  id: 'perfil-dueno-1',
  negocio_id: LOCAL_1,
  nombre: 'Rosa',
  rol: 'dueno',
  permisos: [],
  activo: true,
  persona_id: null,
};
const trabajador: Perfil = {
  id: 'perfil-juan-1',
  negocio_id: LOCAL_1,
  nombre: 'Juan',
  rol: 'cajero',
  permisos: ['vender', 'multi_local'],
  activo: true,
  persona_id: 'persona-juan',
};

let db: BaseLocal;

const llamadas = (nombre: string) =>
  supabase.rpc.mock.calls.filter(([n]) => n === nombre) as unknown as [
    string,
    Record<string, unknown>,
  ][];

beforeEach(async () => {
  db = crearBaseEnMemoria();
  await migrarBaseDeDatos(db);
  await guardarAjuste(db, AJUSTE_NEGOCIO, LOCAL_1);
  await guardarAjuste(db, AJUSTE_DISPOSITIVO, 'equipo-local-1');
  useSesion.setState({ negocioId: LOCAL_1, perfil: dueno, perfilSugeridoId: null });
  respuestasRpc.mis_negocios = {
    data: [
      { id: LOCAL_1, nombre: 'Centro', direccion: null, estado: 'activa', plan: 'pro' },
      { id: LOCAL_2, nombre: 'Norte', direccion: null, estado: 'prueba', plan: 'pro' },
    ],
    error: null,
  };
  respuestasRpc.mis_locales_como_persona = {
    data: [
      { id: LOCAL_2, nombre: 'Norte', estado: 'activa', plan: 'pro', perfil_id: 'perfil-juan-2' },
    ],
    error: null,
  };
  delete respuestasRpc.registrar_dispositivo;
  delete respuestasRpc.asignar_persona_a_local;
  mockSincronizar.mockReset().mockResolvedValue(undefined);
  mockContarPendientes.mockReset().mockResolvedValue(0);
  supabase.rpc.mockClear();
});

describe('listarLocales', () => {
  it('el dueño ve todos los locales de la cuenta', async () => {
    expect((await listarLocales(dueno)).map((l) => l.id)).toEqual([LOCAL_1, LOCAL_2]);
    expect(llamadas('mis_negocios')).toHaveLength(1);
  });

  it('una persona ve solo los locales donde el dueño la asignó, pidiéndolos por su persona_id', async () => {
    expect((await listarLocales(trabajador)).map((l) => l.id)).toEqual([LOCAL_2]);
    expect(llamadas('mis_locales_como_persona')[0][1]).toEqual({ p_persona_id: 'persona-juan' });
  });

  it('quien no tiene persona_id no ve ningún local', async () => {
    expect(await listarLocales({ ...trabajador, persona_id: null })).toEqual([]);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe('cambiarDeLocal', () => {
  it('cambia de local, registra el equipo nuevo, libera el cupo del anterior y sugiere al dueño', async () => {
    await cambiarDeLocal(db, LOCAL_2);

    expect(useSesion.getState().negocioId).toBe(LOCAL_2);
    expect(useSesion.getState().perfil).toBeNull(); // vuelve a pedir el PIN
    expect(await leerAjuste(db, AJUSTE_NEGOCIO)).toBe(LOCAL_2);
    expect(await leerAjuste(db, AJUSTE_ULTIMO_LOCAL)).toBe(LOCAL_2);
    // Cada local cuenta sus equipos: el destino recibe un id propio, no el del local anterior.
    const registro = llamadas('registrar_dispositivo')[0][1];
    expect(registro.p_negocio_id).toBe(LOCAL_2);
    expect(registro.p_id).not.toBe('equipo-local-1');
    expect(llamadas('desvincular_dispositivo')[0][1]).toEqual({ p_id: 'equipo-local-1' });
    // Se acuerda del local de origen y de qué equipo tenía en cada uno.
    expect(JSON.parse((await leerAjuste(db, AJUSTE_LOCAL_ORIGEN))!)).toMatchObject({
      id: LOCAL_1,
      perfilId: dueno.id,
    });
    expect(await leerAjuste(db, 'dispositivo:local-1')).toBe('equipo-local-1');
  });

  it('una persona llega con su perfil de ese local elegido', async () => {
    useSesion.setState({ perfil: trabajador });
    await cambiarDeLocal(db, LOCAL_2);
    expect(useSesion.getState().perfilSugeridoId).toBe('perfil-juan-2');
  });

  it('sin el permiso multi-local, una persona no puede cambiar de local', async () => {
    useSesion.setState({ perfil: { ...trabajador, permisos: ['vender'] } });
    await expect(cambiarDeLocal(db, LOCAL_2)).rejects.toThrow('No tienes permiso');
    expect(llamadas('registrar_dispositivo')).toHaveLength(0);
  });

  it('un local que el servidor no le lista no se puede abrir', async () => {
    useSesion.setState({ perfil: trabajador });
    await expect(cambiarDeLocal(db, 'local-ajeno')).rejects.toThrow('no está disponible');
    expect(useSesion.getState().negocioId).toBe(LOCAL_1);
  });

  it('con cambios sin subir no borra nada', async () => {
    mockContarPendientes.mockResolvedValue(3);
    await expect(cambiarDeLocal(db, LOCAL_2)).rejects.toThrow('cambios sin subir');
    expect(await leerAjuste(db, AJUSTE_NEGOCIO)).toBe(LOCAL_1);
    expect(llamadas('registrar_dispositivo')).toHaveLength(0);
  });

  it('sin internet no borra nada', async () => {
    mockSincronizar.mockRejectedValue(new Error('network'));
    await expect(cambiarDeLocal(db, LOCAL_2)).rejects.toThrow('No se pudo sincronizar');
    expect(await leerAjuste(db, AJUSTE_NEGOCIO)).toBe(LOCAL_1);
    expect(useSesion.getState().negocioId).toBe(LOCAL_1);
  });

  it('si el local destino está al tope de equipos, falla antes de borrar los datos de aquí', async () => {
    respuestasRpc.registrar_dispositivo = { data: null, error: { message: 'LIMITE_DISPOSITIVOS' } };
    await expect(cambiarDeLocal(db, LOCAL_2)).rejects.toThrow('LIMITE_DISPOSITIVOS');
    expect(await leerAjuste(db, AJUSTE_NEGOCIO)).toBe(LOCAL_1);
    expect(useSesion.getState().negocioId).toBe(LOCAL_1);
    expect(llamadas('desvincular_dispositivo')).toHaveLength(0);
  });

  it('puede volver al local de origen aunque ya no figure en su lista', async () => {
    useSesion.setState({ negocioId: LOCAL_2, perfil: { ...trabajador, negocio_id: LOCAL_2 } });
    await guardarAjuste(
      db,
      AJUSTE_LOCAL_ORIGEN,
      JSON.stringify({ id: LOCAL_1, nombre: 'Centro', perfilId: trabajador.id }),
    );
    respuestasRpc.mis_locales_como_persona = { data: [], error: null };

    await cambiarDeLocal(db, LOCAL_1);

    expect(useSesion.getState().negocioId).toBe(LOCAL_1);
    expect(useSesion.getState().perfilSugeridoId).toBe(trabajador.id);
    expect(await leerAjuste(db, AJUSTE_LOCAL_ORIGEN)).toBe('');
  });

  it('al volver a un local usa el equipo que ya tenía ahí', async () => {
    await guardarAjuste(db, 'dispositivo:local-2', 'equipo-local-2');
    await cambiarDeLocal(db, LOCAL_2);
    expect(llamadas('registrar_dispositivo')[0][1].p_id).toBe('equipo-local-2');
  });

  it('si entra un cambio mientras se registra el equipo, no borra y libera el cupo del destino', async () => {
    // Primera comprobación sin pendientes; la segunda (justo antes de borrar), con uno.
    mockContarPendientes.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(cambiarDeLocal(db, LOCAL_2)).rejects.toThrow('cambios sin subir');
    expect(await leerAjuste(db, AJUSTE_NEGOCIO)).toBe(LOCAL_1);
    expect(useSesion.getState().negocioId).toBe(LOCAL_1);
    expect(llamadas('desvincular_dispositivo')).toHaveLength(1);
  });

  it('pausa la sincronización automática mientras cambia y la reanuda al terminar', async () => {
    const { sincronizacionPausada } = require('@/sync/pausa');
    let pausadaDentro = false;
    mockSincronizar.mockImplementation(() => {
      pausadaDentro = sincronizacionPausada();
      return Promise.resolve();
    });
    await cambiarDeLocal(db, LOCAL_2);
    expect(pausadaDentro).toBe(true);
    expect(sincronizacionPausada()).toBe(false);
  });

  it('la reanuda también si el cambio falla', async () => {
    const { sincronizacionPausada } = require('@/sync/pausa');
    mockContarPendientes.mockResolvedValue(2);
    await expect(cambiarDeLocal(db, LOCAL_2)).rejects.toThrow();
    expect(sincronizacionPausada()).toBe(false);
  });

  describe('si falla después de borrar los datos', () => {
    // La primera sincronización del destino (dentro de vincularTelefono) falla; la segunda es la
    // del intento de volver al origen.
    const fallaElDestino = () => {
      mockSincronizar
        .mockResolvedValueOnce(undefined) // exigirTodoSubido
        .mockRejectedValueOnce(new Error('sin red al bajar el destino'));
    };

    it('libera el cupo del destino y vuelve al local de origen', async () => {
      fallaElDestino();
      await expect(cambiarDeLocal(db, LOCAL_2)).rejects.toThrow('sin red');
      expect(await leerAjuste(db, AJUSTE_NEGOCIO)).toBe(LOCAL_1);
      expect(useSesion.getState().negocioId).toBe(LOCAL_1);
      const liberados = llamadas('desvincular_dispositivo').map(([, a]) => a.p_id);
      expect(liberados).toHaveLength(1);
      expect(liberados[0]).not.toBe('equipo-local-1'); // el del destino, no el de origen
    });

    it('si tampoco puede volver, deja el equipo sin sesión con un aviso claro', async () => {
      fallaElDestino();
      mockSincronizar.mockRejectedValueOnce(new Error('sigue sin red'));
      await expect(cambiarDeLocal(db, LOCAL_2)).rejects.toThrow('sin red');
      expect(useSesion.getState().negocioId).toBeNull();
      expect(useSesion.getState().avisoSalida).toContain('Ingresa de nuevo');
    });
  });
});

describe('agregarLocal', () => {
  const DATOS_LOCAL = {
    nombreNegocio: 'Local Sur',
    rut: '',
    direccion: '',
    nombreDueno: 'Rosa',
    pin: '1234',
  };

  beforeEach(() => {
    respuestasRpc.crear_negocio = { data: LOCAL_2, error: null };
  });

  it('crea el local y se cambia a él', async () => {
    await agregarLocal(db, DATOS_LOCAL);
    expect(llamadas('crear_negocio')).toHaveLength(1);
    expect(useSesion.getState().negocioId).toBe(LOCAL_2);
  });

  it('con cambios sin subir no crea nada en el servidor', async () => {
    mockContarPendientes.mockResolvedValue(2);
    await expect(agregarLocal(db, DATOS_LOCAL)).rejects.toThrow('cambios sin subir');
    expect(llamadas('crear_negocio')).toHaveLength(0);
  });

  it('si el local se creó pero no se pudo pasar a él, avisa que ya existe (no hay que crearlo otra vez)', async () => {
    respuestasRpc.registrar_dispositivo = { data: null, error: { message: 'LIMITE_DISPOSITIVOS' } };
    const error = await agregarLocal(db, DATOS_LOCAL).catch((e) => e);
    expect(error).toBeInstanceOf(LocalCreadoSinCambio);
    expect(error.message).toContain('Mis locales');
    expect(useSesion.getState().negocioId).toBe(LOCAL_1);
  });

  it('solo el dueño agrega locales', async () => {
    useSesion.setState({ perfil: trabajador });
    await expect(agregarLocal(db, DATOS_LOCAL)).rejects.toThrow('Solo el dueño');
    expect(llamadas('crear_negocio')).toHaveLength(0);
  });
});

describe('asignarPersonaALocal', () => {
  const DATOS = {
    perfilId: 'perfil-juan-1',
    nombre: 'Juan',
    negocioDestino: LOCAL_2,
    pin: '1234',
    permisos: ['vender', 'multi_local'] as const,
  };

  it('solo el dueño asigna personas a otros locales', async () => {
    useSesion.setState({ perfil: trabajador });
    await expect(asignarPersonaALocal(db, DATOS)).rejects.toThrow('Solo el dueño');
    expect(llamadas('asignar_persona_a_local')).toHaveLength(0);
  });

  it('sincroniza primero y pide al servidor crear el perfil allá a partir del de aquí', async () => {
    await asignarPersonaALocal(db, DATOS);

    // Una sincronización antes (la persona tiene que estar en el servidor) y otra después.
    expect(mockSincronizar).toHaveBeenCalledTimes(2);
    const [args] = llamadas('asignar_persona_a_local').map(([, a]) => a);
    expect(args).toMatchObject({
      p_negocio_destino: LOCAL_2,
      p_nombre: 'Juan',
      p_perfil_origen: 'perfil-juan-1', // la unión (persona_id) la arma el servidor
      p_permisos: ['vender', 'multi_local'],
    });
    expect(args).not.toHaveProperty('p_persona_id');
    expect(args.p_pin_hash).not.toBe('1234'); // nunca va el PIN en claro
  });

  it('sin internet no llama al servidor', async () => {
    mockSincronizar.mockRejectedValue(new Error('network'));
    await expect(asignarPersonaALocal(db, DATOS)).rejects.toThrow('Necesitas internet');
    expect(llamadas('asignar_persona_a_local')).toHaveLength(0);
  });

  it('traduce el error de una persona ya asignada', async () => {
    respuestasRpc.asignar_persona_a_local = {
      data: null,
      error: { message: 'PERSONA_YA_ASIGNADA' },
    };
    await expect(asignarPersonaALocal(db, DATOS)).rejects.toThrow('ya está asignada');
  });
});

describe('iniciarSesion con varios locales', () => {
  beforeEach(() => {
    respuestasTabla.negocio_usuarios = {
      data: [{ negocio_id: LOCAL_1 }, { negocio_id: LOCAL_2 }],
      error: null,
    };
  });

  it('abre el último local usado en este equipo', async () => {
    await guardarAjuste(db, AJUSTE_ULTIMO_LOCAL, LOCAL_2);
    await iniciarSesion(db, 'rosa@ejemplo.cl', 'clave');
    expect(useSesion.getState().negocioId).toBe(LOCAL_2);
  });

  it('sin pista, abre el más antiguo', async () => {
    await iniciarSesion(db, 'rosa@ejemplo.cl', 'clave');
    expect(useSesion.getState().negocioId).toBe(LOCAL_1);
  });

  it('una pista de un local que ya no es de la cuenta se ignora', async () => {
    await guardarAjuste(db, AJUSTE_ULTIMO_LOCAL, 'local-borrado');
    await iniciarSesion(db, 'rosa@ejemplo.cl', 'clave');
    expect(useSesion.getState().negocioId).toBe(LOCAL_1);
  });

  it('una cuenta sin locales queda sin negocio', async () => {
    respuestasTabla.negocio_usuarios = { data: [], error: null };
    expect(await iniciarSesion(db, 'rosa@ejemplo.cl', 'clave')).toEqual({ tipo: 'sin_negocio' });
  });
});
