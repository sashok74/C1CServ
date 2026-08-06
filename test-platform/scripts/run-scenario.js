// Прогон сценария через C1CServ с обязательными preflight-гейтами.
//   --scenario <file>   (по умолчанию test-platform/scenarios/order-basic.json)
//   --force-reset       очистить c1_data_test перед прогоном, если журнал не пуст
// Окружение: C1CSERV_URL, MOCK_URL, TEST_JOURNAL_URI, RUN_DIR (каталог отчётов)
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { MongoClient } from 'mongodb';

const C1CSERV_URL = process.env.C1CSERV_URL || 'http://127.0.0.1:3738';
const MOCK_URL = process.env.MOCK_URL || 'http://127.0.0.1:8125';
const TEST_JOURNAL_URI = process.env.TEST_JOURNAL_URI;
const RUN_DIR = process.env.RUN_DIR || path.resolve('test-platform', 'reports');
const EXPECTED_DB_SUFFIX = process.env.EXPECTED_DB_SUFFIX || 'erp_base_api_c1.fdb';

const args = process.argv.slice(2);
const scenarioFile =
  args.includes('--scenario') ? args[args.indexOf('--scenario') + 1] : path.resolve('test-platform', 'scenarios', 'order-basic.json');
const forceReset = args.includes('--force-reset');

const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));

async function preflight() {
  // 1. Мок жив
  const health = (await axios.get(`${MOCK_URL}/__health`, { timeout: 5000 })).data;
  if (health.status !== 'ok') throw new Error(`мок не готов: ${JSON.stringify(health)}`);
  console.log(`preflight: мок ok (mongo=${health.mongo}, склад остатков=${health.stockStorageGuid || 'нет'})`);

  // 2. C1CServ жив
  await axios.get(`${C1CSERV_URL}/`, { timeout: 5000 });
  console.log('preflight: C1CServ ok');

  // 3. ГЛАВНЫЙ ГЕЙТ: C1CServ смотрит в тестовый клон, не в прод
  const dbInfo = (await axios.get(`${C1CSERV_URL}/test_db`, { timeout: 30000 })).data;
  const dbInfoStr = JSON.stringify(dbInfo);
  if (!dbInfoStr.includes(EXPECTED_DB_SUFFIX)) {
    throw new Error(`СТОП: /test_db не подтверждает тестовую базу (${EXPECTED_DB_SUFFIX}). Ответ: ${dbInfoStr.slice(0, 500)}`);
  }
  console.log(`preflight: Firebird = тестовый клон (${EXPECTED_DB_SUFFIX})`);

  // 4. Журнал пуст (иначе анти-дубль молча пропустит импорт)
  if (!TEST_JOURNAL_URI) throw new Error('TEST_JOURNAL_URI не задан');
  const client = await MongoClient.connect(TEST_JOURNAL_URI);
  try {
    const db = client.db();
    const collections = await db.listCollections().toArray();
    let total = 0;
    for (const { name } of collections) total += await db.collection(name).countDocuments();
    if (total > 0) {
      if (!forceReset) throw new Error(`журнал ${db.databaseName} не пуст (${total} док.) — прогон бессмыслен из-за анти-дубля; запусти с --force-reset`);
      for (const { name } of collections) await db.collection(name).drop();
      console.log(`preflight: журнал ${db.databaseName} очищен (--force-reset)`);
    } else {
      console.log(`preflight: журнал ${db.databaseName} пуст`);
    }
  } finally {
    await client.close();
  }
}

await preflight();

const startedAt = new Date().toISOString();
const runDir = path.join(RUN_DIR, `run-${startedAt.replace(/[:.]/g, '-')}`);
fs.mkdirSync(runDir, { recursive: true });

const run = { startedAt, scenarioFile, scenario: scenario.name, steps: [], errors: [] };

for (const step of scenario.steps) {
  console.log(`POST ${step.route} ${JSON.stringify(step.body).slice(0, 120)}`);
  let status = null;
  let data = null;
  try {
    const res = await axios.post(`${C1CSERV_URL}${step.route}`, step.body, { timeout: 600000 });
    status = res.status;
    data = res.data;
  } catch (err) {
    status = err.response?.status ?? 'network-error';
    data = err.response?.data ?? { error: err.message };
  }
  run.steps.push({ route: step.route, body: step.body, status, response: data });

  // ВАЖНО: ошибки C1CServ прячутся в теле HTTP 201 (err.errCode 10/20/30/40)
  const findErrors = (node, trail) => {
    if (Array.isArray(node)) node.forEach((item, i) => findErrors(item, `${trail}[${i}]`));
    else if (node !== null && typeof node === 'object') {
      if (node.err && (node.err.errCode || node.err.errDescription)) {
        run.errors.push({ route: step.route, at: trail, err: node.err, uid: node.uid, collection: node.Collection });
      }
      for (const [k, v] of Object.entries(node)) if (k !== 'err') findErrors(v, `${trail}.${k}`);
    }
  };
  findErrors(data, step.route);
}

run.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(run, null, 2));

console.log(`\nПрогон завершён: шагов ${run.steps.length}, ошибок в ответах: ${run.errors.length}`);
for (const e of run.errors) console.log(`  ${e.route} ${e.at}: errCode=${e.err.errCode} ${e.err.errDescription || ''} uid=${e.uid || '-'}`);
console.log(`Отчёт: ${path.join(runDir, 'run.json')}`);

if (run.errors.length > 0) process.exitCode = 1;
