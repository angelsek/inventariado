#!/usr/bin/env node
// Puerta del equipo de agentes: revisa (calidad + seguridad) los cambios de la rama contra main
// antes de cada push. Bloquea si hay hallazgos críticos o altos.
//
//   node .githooks/equipo-revision.mjs              revisa la rama actual
//   (pre-push la llama con --pre-push y las refs por stdin)
//   EQUIPO_OMITIR=1 git push                         salta la revisión (queda registrado)
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CERO = /^0+$/;
const EXCLUIR = ['package-lock.json', '*.png', '*.jpg', '*.ico', '*.jar', '*.keystore', '*.apk'];
const MAX_DIFF = 150_000;
const ROJO = '\x1b[31m';
const VERDE = '\x1b[32m';
const AMARILLO = '\x1b[33m';
const GRIS = '\x1b[90m';
const FIN = '\x1b[0m';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
const intentar = (fn, porDefecto = null) => {
  try {
    return fn();
  } catch {
    return porDefecto;
  }
};

const raiz = git('rev-parse', '--show-toplevel');
const dirEquipo = path.join(git('rev-parse', '--absolute-git-dir'), 'equipo-dev');
fs.mkdirSync(dirEquipo, { recursive: true });

function registrar(entrada) {
  fs.appendFileSync(
    path.join(dirEquipo, 'revisiones.jsonl'),
    JSON.stringify({ fecha: new Date().toISOString(), ...entrada }) + '\n',
  );
}

// Qué se va a revisar: cada rama que se empuja (pre-push) o la rama actual.
function objetivos() {
  if (!process.argv.includes('--pre-push')) {
    return [{ sha: git('rev-parse', 'HEAD'), rama: git('rev-parse', '--abbrev-ref', 'HEAD') }];
  }
  const entrada = intentar(() => fs.readFileSync(0, 'utf8'), '');
  return entrada
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter(([, sha, ref]) => sha && !CERO.test(sha) && ref?.startsWith('refs/heads/'))
    .map(([, sha, ref]) => ({ sha, rama: ref.replace('refs/heads/', '') }));
}

function revisar({ sha, rama }) {
  if (rama === 'main' && process.argv.includes('--pre-push')) {
    console.error(
      `${ROJO}✖ Push directo a main bloqueado.${FIN} La regla del equipo exige trabajar en una rama y abrir un PR.\n` +
        `  Si es una urgencia: EQUIPO_OMITIR=1 git push`,
    );
    return false;
  }
  // EQUIPO_BASE permite comparar contra otra rama (por ejemplo, mientras main no sea la rama principal).
  const base = process.env.EQUIPO_BASE
    ? intentar(() => git('merge-base', process.env.EQUIPO_BASE, sha))
    : (intentar(() => git('merge-base', 'origin/main', sha)) ??
      intentar(() => git('merge-base', 'main', sha)));
  if (!base) {
    console.error(
      `${AMARILLO}⚠ No encuentro la rama base para comparar; se omite la revisión de ${rama}.${FIN}`,
    );
    return true;
  }
  const excl = EXCLUIR.map((p) => `:(exclude)${p}`);
  const diff = git('diff', '--no-color', base, sha, '--', '.', ...excl);
  if (!diff) return true;
  const huella = createHash('sha256').update(diff).digest('hex').slice(0, 16);
  const aprobado = path.join(dirEquipo, `aprobado-${huella}`);
  if (fs.existsSync(aprobado)) {
    console.log(
      `${VERDE}✔ Equipo: estos cambios de ${rama} ya fueron revisados y aprobados.${FIN}`,
    );
    return true;
  }

  const stat = git('diff', '--stat', base, sha, '--', '.', ...excl);
  const commits = git('log', '--oneline', `${base}..${sha}`);
  const truncado = diff.length > MAX_DIFF;
  const recorte = truncado
    ? diff.slice(0, MAX_DIFF) + `\n\n[... diff truncado: ${diff.length} caracteres en total]`
    : diff;
  if (truncado) {
    console.log(
      `${AMARILLO}⚠ El diff es muy grande (${diff.length} caracteres): solo se revisan los primeros ${MAX_DIFF}. ` +
        `Divide el trabajo en PRs más pequeños.${FIN}`,
    );
  }
  const prompt = `Eres la puerta de revisión del equipo de agentes de este repositorio. Revisa los cambios de la rama "${rama}" contra main.
Combina dos papeles: revisor de código (bugs, datos, convenciones de CLAUDE.md/AGENTS.md, tests) y auditor de seguridad (secretos, inyección, autorización/RLS, datos personales, dependencias, permisos de workflows).
Puedes leer archivos del repo para entender el contexto. No modifiques nada.

Severidades: "critica" (rompe la app, pierde datos o expone secretos), "alta" (bug probable en uso normal o vulnerabilidad explotable), "media", "baja", "info".
Veredicto: "bloqueado" si hay alguna critica o alta; "cambios_menores" si solo hay media/baja; "aprobado" si no hay nada relevante.
Sé concreto y no inventes problemas. Nunca copies valores de secretos.

Termina tu respuesta con un único bloque \`\`\`json con exactamente esta forma:
{"veredicto": "aprobado|cambios_menores|bloqueado", "resumen": "1-2 frases", "hallazgos": [{"severidad": "...", "tipo": "calidad|seguridad", "archivo": "ruta", "linea": 0, "titulo": "...", "detalle": "...", "sugerencia": "..."}]}

## Commits
${commits}

## Archivos
${stat}

## Diff
${recorte}`;

  console.log(
    `${GRIS}… Equipo de agentes revisando ${rama} (${commits.split('\n').length} commits). Puede tardar 1-3 minutos.${FIN}`,
  );
  // claude es un shim de npm en Windows (.cmd): se lanza vía shell con argumentos fijos; el prompt va por stdin.
  const r = spawnSync(
    'claude -p --output-format json --model sonnet --allowedTools Read Grep Glob --disallowedTools Bash Write Edit WebFetch WebSearch',
    {
      cwd: raiz,
      input: prompt,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    },
  );
  const salida = intentar(() => JSON.parse(r.stdout));
  const bloque = salida?.result?.match(/```json\s*([\s\S]*?)```(?![\s\S]*```json)/);
  const leido = bloque ? intentar(() => JSON.parse(bloque[1])) : null;
  if (leido && !Array.isArray(leido.hallazgos)) leido.hallazgos = [];
  const veredicto = ['aprobado', 'cambios_menores', 'bloqueado'].includes(leido?.veredicto)
    ? leido
    : null;
  if (!veredicto) {
    // Si el equipo no está disponible (sin claude, sin red, sin cuota) no se bloquea el trabajo: se avisa y se registra.
    console.error(
      `${AMARILLO}⚠ El equipo no pudo revisar (${r.error?.code || `código ${r.status}`}). Se permite el push; ` +
        `la revisión del PR en GitHub sigue siendo obligatoria.${FIN}`,
    );
    registrar({
      rama,
      sha,
      base,
      veredicto: 'sin_revision',
      error: (r.stderr || '').slice(0, 300),
    });
    return true;
  }

  const orden = ['critica', 'alta', 'media', 'baja', 'info'];
  const color = { critica: ROJO, alta: ROJO, media: AMARILLO, baja: GRIS, info: GRIS };
  const hallazgos = (veredicto.hallazgos || []).sort(
    (a, b) => orden.indexOf(a.severidad) - orden.indexOf(b.severidad),
  );
  const bloqueado =
    veredicto.veredicto === 'bloqueado' ||
    hallazgos.some((h) => ['critica', 'alta'].includes(h.severidad));
  console.log(
    `\n${bloqueado ? ROJO + '✖ BLOQUEADO' : VERDE + '✔ ' + veredicto.veredicto.toUpperCase()}${FIN} — ${veredicto.resumen}`,
  );
  for (const h of hallazgos) {
    console.log(
      `  ${color[h.severidad] || ''}[${h.severidad}]${FIN} ${h.titulo} ${GRIS}(${h.tipo}) ${h.archivo}${h.linea ? ':' + h.linea : ''}${FIN}`,
    );
    if (h.detalle) console.log(`      ${h.detalle}`);
    if (h.sugerencia) console.log(`      → ${h.sugerencia}`);
  }
  fs.writeFileSync(
    path.join(dirEquipo, 'ultima-revision.json'),
    JSON.stringify({ rama, sha, base, ...veredicto }, null, 2),
  );
  registrar({
    rama,
    sha,
    base,
    veredicto: bloqueado ? 'bloqueado' : veredicto.veredicto,
    hallazgos: hallazgos.length,
    coste_usd: salida?.total_cost_usd,
  });
  if (bloqueado) {
    console.error(
      `\nCorrige los hallazgos críticos/altos y vuelve a intentarlo (en Claude Code: /equipo-dev:revisar).` +
        `\nSolo en una urgencia: EQUIPO_OMITIR=1 git push`,
    );
    return false;
  }
  // Un diff truncado no se marca como aprobado: lo que quedó fuera no se revisó.
  if (!truncado) fs.writeFileSync(aprobado, new Date().toISOString());
  return true;
}

if (process.env.EQUIPO_OMITIR === '1') {
  console.error(
    `${AMARILLO}⚠ Revisión del equipo omitida (EQUIPO_OMITIR=1). Queda registrado.${FIN}`,
  );
  registrar({ veredicto: 'omitido', ramas: objetivos().map((o) => o.rama) });
  process.exit(0);
}
let ok = true;
for (const objetivo of objetivos()) ok = revisar(objetivo) && ok;
process.exit(ok ? 0 : 1);
