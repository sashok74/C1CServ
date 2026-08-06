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

const RUN_DIR = process.env.RUN_DIR || path.resolve('test-platform', 'reports');
fs.mkdirSync(RUN_DIR, { recursive: true });
const before = new Set(fs.readdirSync(RUN_DIR).filter((d) => d.startsWith('run-')));

const scenarioStatus = run('run-scenario.js', [...args, '--force-reset']);

// verify — только по каталогу, созданному ЭТИМ прогоном (не по прошлому)
const created = fs
  .readdirSync(RUN_DIR)
  .filter((d) => d.startsWith('run-') && !before.has(d))
  .sort();
const last = created[created.length - 1];
if (!last) {
  console.error('run-all: прогон не создал каталог отчёта — verify пропущен');
  process.exit(scenarioStatus || 1);
}
// verify запускаем даже при ошибках прогона — отчёт полезен для диагностики
const verifyStatus = run('verify.js', ['--run', path.join(RUN_DIR, last)]);

// снимок выгрузки в 1С по свежеимпортированным данным: export/export.md рядом с отчётом.
// Не влияет на код возврата теста — это материал для просмотра глазами.
console.log('\nВыгрузка в 1С (снимок):');
run('export-dump.js', ['--out', path.join(RUN_DIR, last, 'export'), ...(args.includes('--full-export') ? ['--full'] : [])]);

process.exit(scenarioStatus || verifyStatus);
