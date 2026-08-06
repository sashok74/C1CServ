// Полный цикл: очистка журнала → прогон сценария → verify.
// Аргументы пробрасываются в run-scenario (--scenario, --force-reset подразумевается).
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const args = process.argv.slice(2);

function run(script, extra = []) {
  const res = spawnSync(process.execPath, [path.join(here, script), ...extra], { stdio: 'inherit' });
  return res.status ?? 1;
}

const scenarioStatus = run('run-scenario.js', [...args, '--force-reset']);

// verify запускаем даже при ошибках прогона — отчёт полезен для диагностики
const RUN_DIR = process.env.RUN_DIR || path.resolve('test-platform', 'reports');
const runs = fs
  .readdirSync(RUN_DIR)
  .filter((d) => d.startsWith('run-'))
  .sort();
const last = runs[runs.length - 1];
if (!last) {
  console.error('run-all: нет каталога прогона');
  process.exit(1);
}
const verifyStatus = run('verify.js', ['--run', path.join(RUN_DIR, last)]);

process.exit(scenarioStatus || verifyStatus);
