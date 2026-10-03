#!/usr/bin/env node
// Revisa `npm audit` contra las excepciones documentadas en scripts/excepciones-audit.json.
//
// Falla solo ante avisos NUEVOS (severidad moderada o mayor sin excepción) y únicamente en modo
// estricto (AUDIT_ESTRICTO=true: PRs que tocan dependencias y la revisión semanal). En los demás
// casos los muestra como aviso, para que un aviso publicado hoy no bloquee un PR que no toca
// dependencias. También avisa de excepciones vencidas o que ya no aparecen (para limpiarlas).
// Ver docs/SEGURIDAD_DEPENDENCIAS.md.
//
//   npm run audit:revisar                 informativo
//   AUDIT_ESTRICTO=true npm run audit:revisar
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const SEVERIDADES = ['info', 'low', 'moderate', 'high', 'critical'];
const MINIMA = SEVERIDADES.indexOf('moderate');

/** Avisos raíz (GHSA) presentes en un `npm audit --json`, con los paquetes afectados. */
function avisosRaiz(audit) {
  const avisos = new Map();
  for (const [paquete, vuln] of Object.entries(audit?.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== 'object' || !via) continue; // los intermedios (string) se cubren solos
      const ghsa = String(via.url ?? '').match(/GHSA(-[0-9a-z]{4}){3}/i)?.[0];
      if (!ghsa) continue;
      const aviso = avisos.get(ghsa) ?? {
        ghsa,
        severidad: via.severity,
        titulo: via.title,
        paquetes: new Set(),
      };
      aviso.paquetes.add(via.name ?? paquete);
      avisos.set(ghsa, aviso);
    }
  }
  return avisos;
}

/**
 * Compara el audit con las excepciones. Devuelve { errores, avisos } (textos).
 * `estricto`: los avisos nuevos (y un audit que no se pudo leer) son errores.
 */
function evaluar(audit, excepciones, hoy, { estricto = false } = {}) {
  const errores = [];
  const avisos = [];
  const problema = (texto) => (estricto ? errores : avisos).push(texto);
  if (!audit || typeof audit !== 'object' || !audit.vulnerabilities) {
    problema('No se pudo leer el resultado de npm audit.');
    return { errores, avisos };
  }
  const presentes = avisosRaiz(audit);
  const porGhsa = new Map(excepciones.map((e) => [e.ghsa, e]));
  for (const aviso of presentes.values()) {
    if (SEVERIDADES.indexOf(aviso.severidad) < MINIMA) continue;
    const excepcion = porGhsa.get(aviso.ghsa);
    const desc = `${aviso.ghsa} (${aviso.severidad}) en ${[...aviso.paquetes].join(', ')}: ${aviso.titulo}`;
    if (!excepcion) {
      problema(`Vulnerabilidad nueva sin analizar: ${desc}. Ver docs/SEGURIDAD_DEPENDENCIAS.md.`);
    } else if (excepcion.revisar_antes && excepcion.revisar_antes < hoy) {
      avisos.push(`Excepción vencida (revisar antes de ${excepcion.revisar_antes}): ${desc}.`);
    }
  }
  for (const e of excepciones) {
    if (!presentes.has(e.ghsa)) {
      avisos.push(`La excepción ${e.ghsa} (${e.paquete}) ya no aparece en el audit: quítala.`);
    }
  }
  return { errores, avisos };
}

function main() {
  const estricto = process.env.AUDIT_ESTRICTO === 'true' || process.argv.includes('--estricto');
  const excepciones = JSON.parse(
    fs.readFileSync(require.resolve('./excepciones-audit.json'), 'utf8'),
  ).excepciones;
  // npm audit sale con código distinto de 0 cuando hay vulnerabilidades: se ignora y se lee el JSON.
  // En Windows npm es npm.cmd y necesita shell: se pasa como un único comando fijo.
  const opciones = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  const r =
    process.platform === 'win32'
      ? spawnSync('npm audit --json', { ...opciones, shell: true })
      : spawnSync('npm', ['audit', '--json'], opciones);
  let audit = null;
  try {
    audit = JSON.parse(r.stdout);
  } catch {
    audit = null;
  }
  const hoy = new Date().toISOString().slice(0, 10);
  const { errores, avisos } = evaluar(audit, excepciones, hoy, { estricto });
  const enActions = process.env.GITHUB_ACTIONS === 'true';
  for (const a of avisos) console.log(enActions ? `::warning::${a}` : `Aviso: ${a}`);
  for (const e of errores) console.log(enActions ? `::error::${e}` : `Error: ${e}`);
  console.log(
    `Auditoría de dependencias: ${errores.length} error(es), ${avisos.length} aviso(s)` +
      (estricto ? ' (modo estricto).' : ' (modo informativo).'),
  );
  process.exitCode = errores.length ? 1 : 0;
}

module.exports = { avisosRaiz, evaluar };
if (require.main === module) main();
