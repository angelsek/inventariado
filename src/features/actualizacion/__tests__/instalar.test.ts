import { startActivityAsync } from 'expo-intent-launcher';

import { descargarEInstalar } from '../instalar';
import { ErrorIntegridad, ErrorOrigen, PRIMER_CODIGO_CON_HASH } from '../integridad';
import { sha256Archivo } from '../sha256';

type Falso = {
  existe: boolean;
  tamano: number;
  borrado: number;
  renombrado: string | null;
};

// Sistema de archivos falso en memoria, indexado por nombre.
const mockArchivos = new Map<string, Falso>();
const mockDescargas: { url: string; nombre: string }[] = [];
let mockTamanoDescarga = 70_000_000;

jest.mock('expo-file-system', () => {
  const estado = (nombre: string) => {
    let f = mockArchivos.get(nombre);
    if (!f) {
      f = { existe: false, tamano: 0, borrado: 0, renombrado: null };
      mockArchivos.set(nombre, f);
    }
    return f;
  };
  class File {
    name: string;
    constructor(_dir: unknown, nombre: string) {
      this.name = nombre;
    }
    get exists() {
      return estado(this.name).existe;
    }
    get size() {
      return estado(this.name).tamano;
    }
    get uri() {
      return `file:///cache/${this.name}`;
    }
    get contentUri() {
      return `content://cache/${this.name}`;
    }
    delete() {
      const f = estado(this.name);
      f.existe = false;
      f.borrado += 1;
    }
    rename(nuevo: string) {
      const f = estado(this.name);
      const destino = estado(nuevo);
      destino.existe = true;
      destino.tamano = f.tamano;
      f.existe = false;
      f.renombrado = nuevo;
      this.name = nuevo;
    }
    static createDownloadTask(url: string, destino: File) {
      return {
        downloadAsync: async () => {
          mockDescargas.push({ url, nombre: destino.name });
          const f = estado(destino.name);
          f.existe = mockTamanoDescarga > 0;
          f.tamano = mockTamanoDescarga;
        },
      };
    }
  }
  return { File, Paths: { cache: { list: () => [] } } };
});
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn(async () => ({})) }));
jest.mock('../sha256', () => ({ sha256Archivo: jest.fn() }));

const URL_OK = 'https://github.com/angelsek/inventariado/releases/download/v15/stockeao.apk';
const HASH = 'a'.repeat(64);
const HASH_MALO = 'b'.repeat(64);
const CODIGO = 15;
const APK = 'stockeao-15.apk';
const PARCIAL = 'stockeao-15.apk.parcial';

const archivo = (nombre: string) => mockArchivos.get(nombre);
const sha = jest.mocked(sha256Archivo);

beforeEach(() => {
  mockArchivos.clear();
  mockDescargas.length = 0;
  mockTamanoDescarga = 70_000_000;
  jest.clearAllMocks();
  sha.mockResolvedValue(HASH);
});

it('con el hash correcto renombra la descarga e instala', async () => {
  const alAvanzar = jest.fn();
  await descargarEInstalar(URL_OK, CODIGO, HASH, alAvanzar);

  expect(mockDescargas).toEqual([{ url: URL_OK, nombre: PARCIAL }]);
  expect(archivo(PARCIAL)?.renombrado).toBe(APK);
  expect(archivo(APK)?.existe).toBe(true);
  expect(alAvanzar).toHaveBeenLastCalledWith(1);
  expect(startActivityAsync).toHaveBeenCalledWith(
    'android.intent.action.VIEW',
    expect.objectContaining({ data: `content://cache/${APK}` }),
  );
});

it('con hash distinto borra el parcial, no instala y lanza ErrorIntegridad', async () => {
  sha.mockResolvedValue(HASH_MALO);
  await expect(descargarEInstalar(URL_OK, CODIGO, HASH, jest.fn())).rejects.toBeInstanceOf(
    ErrorIntegridad,
  );
  expect(archivo(PARCIAL)?.existe).toBe(false);
  expect(archivo(PARCIAL)?.borrado).toBeGreaterThan(0);
  expect(archivo(APK)?.existe ?? false).toBe(false);
  expect(startActivityAsync).not.toHaveBeenCalled();
});

it('APK en caché con hash malo: lo borra, descarga de nuevo y verifica', async () => {
  mockArchivos.set(APK, { existe: true, tamano: 70_000_000, borrado: 0, renombrado: null });
  sha.mockResolvedValueOnce(HASH_MALO).mockResolvedValueOnce(HASH);

  await descargarEInstalar(URL_OK, CODIGO, HASH, jest.fn());

  expect(archivo(APK)?.borrado).toBe(1);
  expect(mockDescargas).toHaveLength(1);
  expect(sha).toHaveBeenCalledTimes(2);
  expect(archivo(APK)?.existe).toBe(true);
  expect(startActivityAsync).toHaveBeenCalledTimes(1);
});

it('caché correcta: instala sin descargar', async () => {
  mockArchivos.set(APK, { existe: true, tamano: 70_000_000, borrado: 0, renombrado: null });
  await descargarEInstalar(URL_OK, CODIGO, HASH, jest.fn());
  expect(mockDescargas).toHaveLength(0);
  expect(startActivityAsync).toHaveBeenCalledTimes(1);
});

it('URL no permitida: no descarga y lanza ErrorOrigen', async () => {
  await expect(
    descargarEInstalar('https://x/apk/a.apk', CODIGO, HASH, jest.fn()),
  ).rejects.toBeInstanceOf(ErrorOrigen);
  expect(mockDescargas).toHaveLength(0);
  expect(sha).not.toHaveBeenCalled();
  expect(startActivityAsync).not.toHaveBeenCalled();
});

it('versión antigua sin sha256 publicado se instala sin calcular el hash', async () => {
  expect(CODIGO).toBeLessThan(PRIMER_CODIGO_CON_HASH);
  await descargarEInstalar(URL_OK, CODIGO, null, jest.fn());
  expect(sha).not.toHaveBeenCalled();
  expect(startActivityAsync).toHaveBeenCalledTimes(1);
});

it('versión nueva sin sha256 publicado no se descarga ni instala', async () => {
  await expect(
    descargarEInstalar(URL_OK, PRIMER_CODIGO_CON_HASH, null, jest.fn()),
  ).rejects.toBeInstanceOf(ErrorOrigen);
  expect(mockDescargas).toHaveLength(0);
  expect(startActivityAsync).not.toHaveBeenCalled();
});

it('si el cálculo del hash falla: ErrorIntegridad, borra el parcial y no instala', async () => {
  sha.mockRejectedValue(new Error('módulo nativo no disponible'));
  await expect(descargarEInstalar(URL_OK, CODIGO, HASH, jest.fn())).rejects.toBeInstanceOf(
    ErrorIntegridad,
  );
  expect(archivo(PARCIAL)?.existe).toBe(false);
  expect(startActivityAsync).not.toHaveBeenCalled();
});

it('descarga corta (<1 MB): Error normal, borra el parcial y no instala', async () => {
  mockTamanoDescarga = 5_000;
  const error = await descargarEInstalar(URL_OK, CODIGO, HASH, jest.fn()).catch((e) => e);
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(ErrorIntegridad);
  expect(error.message).toBe('La descarga no se completó.');
  expect(archivo(PARCIAL)?.existe).toBe(false);
  expect(startActivityAsync).not.toHaveBeenCalled();
});

it('descarga que no deja archivo: Error normal', async () => {
  mockTamanoDescarga = 0;
  await expect(descargarEInstalar(URL_OK, CODIGO, HASH, jest.fn())).rejects.toThrow(
    'La descarga no se completó.',
  );
});

it('llama a alVerificar al comprobar el hash', async () => {
  const alVerificar = jest.fn();
  await descargarEInstalar(URL_OK, CODIGO, HASH, jest.fn(), alVerificar);
  expect(alVerificar).toHaveBeenCalledTimes(1);
});

it('un parcial viejo se borra antes de descargar', async () => {
  mockArchivos.set(PARCIAL, { existe: true, tamano: 10, borrado: 0, renombrado: null });
  await descargarEInstalar(URL_OK, CODIGO, HASH, jest.fn());
  expect(archivo(PARCIAL)?.borrado).toBe(1);
});
