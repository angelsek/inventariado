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

import { asignarPersonaALocal, cambiarDeLocal, iniciarSesion, listarLocales } from '../cuenta';
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
    await expect(cambiarDeLocal(db, LOCAL_2)).rejects.toThrow('Necesitas internet');
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
});

describe('asignarPersonaALocal', () => {
  const DATOS = {
    perfilId: 'perfil-juan-1',
    nombre: 'Juan',
    negocioDestino: LOCAL_2,
    pin: '1234',
    permisos: ['vender', 'multi_local'] as const,
  };

  beforeEach(async () => {
    // El perfil de aquí tiene que existir para que reciba su persona_id.
    await db.runAsync(
      `INSERT INTO perfiles (id, negocio_id, nombre, rol, permisos, pin_hash, activo, creado_en, actualizado_en)
       VALUES ('perfil-juan-1', 'local-1', 'Juan', 'cajero', '["vender"]', 'h', 1, 'x', 'x')`,
    );
  });

  it('solo el dueño asigna personas a otros locales', async () => {
    useSesion.setState({ perfil: trabajador });
    await expect(asignarPersonaALocal(db, DATOS)).rejects.toThrow('Solo el dueño');
    expect(llamadas('asignar_persona_a_local')).toHaveLength(0);
  });

  it('crea el perfil en el otro local con la misma persona, su PIN y los permisos', async () => {
    await asignarPersonaALocal(db, DATOS);

    const [args] = llamadas('asignar_persona_a_local').map(([, a]) => a);
    expect(args).toMatchObject({
      p_negocio_destino: LOCAL_2,
      p_nombre: 'Juan',
      p_permisos: ['vender', 'multi_local'],
    });
    expect(args.p_pin_hash).not.toBe('1234'); // nunca va el PIN en claro
    // El perfil de aquí queda con la misma persona (para que el servidor los una).
    const fila = await db.getFirstAsync<{ persona_id: string; pendiente: number }>(
      "SELECT persona_id, pendiente FROM perfiles WHERE id = 'perfil-juan-1'",
    );
    expect(fila?.persona_id).toBe(args.p_persona_id);
    expect(fila?.pendiente).toBeGreaterThan(0);
  });

  it('asignar a otro local no cambia la persona del primero', async () => {
    await asignarPersonaALocal(db, DATOS);
    await asignarPersonaALocal(db, { ...DATOS, negocioDestino: 'local-3' });
    const [a, b] = llamadas('asignar_persona_a_local').map(([, x]) => x);
    expect(a.p_persona_id).toBe(b.p_persona_id);
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
