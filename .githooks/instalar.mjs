// Activa los hooks del equipo (.githooks) al hacer `npm install`.
// Nunca falla: en CI, en EAS o fuera de un repo git simplemente no hace nada.
// Si ya hay otro core.hooksPath configurado, no lo pisa: avisa.
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (!process.env.CI && !process.env.EAS_BUILD) {
  try {
    git('rev-parse', '--is-inside-work-tree');
    let actual = '';
    try {
      actual = git('config', '--get', 'core.hooksPath');
    } catch {
      // no hay hooksPath configurado
    }
    if (!actual) git('config', 'core.hooksPath', '.githooks');
    else if (actual !== '.githooks') {
      console.warn(
        `⚠ core.hooksPath ya apunta a "${actual}". La revisión del equipo antes del push no está activa.\n` +
          '  Para activarla: git config core.hooksPath .githooks',
      );
    }
  } catch {
    // sin git: no hay nada que activar
  }
}
