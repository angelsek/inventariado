// Activa los hooks del equipo (.githooks) al hacer `npm install`.
// Nunca falla: en CI, en EAS o fuera de un repo git simplemente no hace nada.
import { execFileSync } from 'node:child_process';

if (!process.env.CI && !process.env.EAS_BUILD) {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
  } catch {
    // sin git: no hay nada que activar
  }
}
