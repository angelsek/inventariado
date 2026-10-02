// Funciones puras de la puerta del equipo (sin git, sin claude, sin consola).
// Las usa equipo-revision.mjs. Copia de dev-monitor/equipo-global/equipo-lib.mjs: los tests viven allí
// (equipo-lib.test.mjs); cambia el original y vuelve a copiarlo aquí.

export const MAX_DIFF = 150_000; // caracteres por tanda
export const MAX_TANDAS = 5;
export const SEVERIDADES = ['critica', 'alta', 'media', 'baja', 'info'];
export const VEREDICTOS = ['aprobado', 'cambios_menores', 'bloqueado'];

/** Parte un diff unificado en un trozo por archivo (en el orden de git), cada uno terminado en salto de línea. */
export function partirDiff(diff) {
  return diff
    .split(/^(?=diff --git )/m)
    .filter((t) => t.startsWith('diff --git '))
    .map((t) => {
      const texto = t.endsWith('\n') ? t : t + '\n';
      const ruta =
        texto.match(/^\+\+\+ b\/(.*)$/m)?.[1] ??
        texto.match(/^rename to (.*)$/m)?.[1] ??
        texto.match(/^diff --git "?a\/(.*?)"? "?b\//)?.[1] ??
        '';
      return { ruta: ruta.trim(), texto };
    });
}

/** Parte un archivo demasiado grande por sus bloques @@, repitiendo la cabecera en cada parte. */
function partirArchivo({ ruta, texto }, max) {
  const [cabecera, ...bloques] = texto.split(/^(?=@@ )/m);
  if (!bloques.length) {
    return {
      error: `El archivo ${ruta} tiene un cambio de más de ${max} caracteres sin bloques @@; no se puede revisar. Exclúyelo o divide el cambio.`,
    };
  }
  const partes = [];
  let actual = '';
  for (const bloque of bloques) {
    if (cabecera.length + bloque.length > max) {
      return {
        error: `El archivo ${ruta} tiene un bloque de cambios de más de ${max} caracteres; no se puede revisar. Exclúyelo o divide el cambio.`,
      };
    }
    if (actual && cabecera.length + actual.length + bloque.length > max) {
      partes.push(cabecera + actual);
      actual = '';
    }
    actual += bloque;
  }
  if (actual) partes.push(cabecera + actual);
  return { partes: partes.map((t) => ({ ruta, texto: t })) };
}

/**
 * Agrupa los archivos (en el orden de git, que ya agrupa por carpeta) en tandas de hasta `max` caracteres.
 * Devuelve { tandas: [{ texto, rutas }] } o { error } si algo no cabe o hay más de `maxTandas`.
 */
export function agruparEnTandas(archivos, max = MAX_DIFF, maxTandas = MAX_TANDAS) {
  const piezas = [];
  for (const archivo of archivos) {
    if (archivo.texto.length <= max) {
      piezas.push(archivo);
      continue;
    }
    const r = partirArchivo(archivo, max);
    if (r.error) return { error: r.error };
    piezas.push(...r.partes);
  }
  const tandas = [];
  let actual = null;
  for (const p of piezas) {
    if (actual && actual.texto.length + p.texto.length > max) {
      tandas.push(actual);
      actual = null;
    }
    actual ??= { texto: '', rutas: [] };
    actual.texto += p.texto;
    if (!actual.rutas.includes(p.ruta)) actual.rutas.push(p.ruta);
  }
  if (actual) tandas.push(actual);
  if (tandas.length > maxTandas) {
    return {
      error: `El diff necesita ${tandas.length} tandas de revisión y el máximo es ${maxTandas}. Divide el trabajo en PRs más pequeños.`,
    };
  }
  return { tandas };
}

/**
 * Extrae el veredicto del último bloque ```json de la respuesta del modelo, o null si no es válido.
 * Normaliza: severidades en minúscula (las desconocidas cuentan como "alta"), hallazgos solo objetos.
 */
export function extraerVeredicto(texto) {
  const s = String(texto ?? '');
  const inicio = s.lastIndexOf('```json'); // el último bloque: puede haber ejemplos antes
  const fin = inicio < 0 ? -1 : s.indexOf('```', inicio + 7);
  let leido = null;
  try {
    leido = fin < 0 ? null : JSON.parse(s.slice(inicio + 7, fin));
  } catch {
    return null;
  }
  if (!leido || typeof leido !== 'object') return null;
  const veredicto = String(leido.veredicto ?? '').toLowerCase();
  if (!VEREDICTOS.includes(veredicto)) return null;
  const hallazgos = (Array.isArray(leido.hallazgos) ? leido.hallazgos : [])
    .filter((h) => h && typeof h === 'object')
    .map((h) => {
      const crudo = String(h.severidad ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
      const sev =
        { critical: 'critica', high: 'alta', medium: 'media', low: 'baja' }[crudo] ?? crudo;
      return { ...h, severidad: SEVERIDADES.includes(sev) ? sev : 'alta' };
    });
  return { ...leido, veredicto, resumen: String(leido.resumen ?? ''), hallazgos };
}

/** Combina los veredictos de varias tandas: gana el peor y, ante hallazgos repetidos, el más grave. */
export function combinarVeredictos(resultados) {
  const porClave = new Map();
  for (const r of resultados) {
    for (const h of r.hallazgos || []) {
      const clave = `${h.archivo}|${h.linea}|${h.titulo}`;
      const previo = porClave.get(clave);
      if (!previo || SEVERIDADES.indexOf(h.severidad) < SEVERIDADES.indexOf(previo.severidad)) {
        porClave.set(clave, h);
      }
    }
  }
  const hallazgos = [...porClave.values()].sort(
    (a, b) => SEVERIDADES.indexOf(a.severidad) - SEVERIDADES.indexOf(b.severidad),
  );
  let veredicto = resultados.reduce(
    (peor, r) => (VEREDICTOS.indexOf(r.veredicto) > VEREDICTOS.indexOf(peor) ? r.veredicto : peor),
    'aprobado',
  );
  if (hallazgos.some((h) => ['critica', 'alta'].includes(h.severidad))) veredicto = 'bloqueado';
  const resumen =
    resultados.length === 1
      ? (resultados[0].resumen ?? '')
      : resultados.map((r, i) => `Tanda ${i + 1}: ${r.resumen ?? ''}`).join(' ');
  return { veredicto, resumen, hallazgos };
}

/** Quita secuencias de control (ANSI, etc.) de texto generado por el modelo antes de mostrarlo. */
export function limpiar(texto) {
  return (
    String(texto ?? '')
      // OSC (p. ej. cambiar el título de la terminal): ESC ] ... BEL o ESC \
      // eslint-disable-next-line no-control-regex
      .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g, '')
      // CSI y otras secuencias de escape
      // eslint-disable-next-line no-control-regex
      .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g, '')
      // resto de caracteres de control salvo salto de línea y tabulador
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
  );
}
