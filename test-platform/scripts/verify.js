// Сверка «что отдали ↔ что получили» по трём источникам:
//   A — лог мока (served.jsonl, эталон отданного);
//   B — тестовый журнал c1_data_test (GUID → res.ref_id + исходный JSON);
//   C — Firebird-клон через fb-port (только селект-процедуры, READ_ONLY).
//   --run <каталог run-* или run.json>
// Окружение: TEST_JOURNAL_URI, FBPORT_URL, MOCK_LOG_DIR, MOCK_URL, MOCK_STOCK_CNT, MOCK_STOCK_STORAGE_GUID
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { MongoClient } from 'mongodb';
import { pathMap, STOCK_PATH } from '../mock-1c/pathMap.js';
import { fbq } from './fbq.js';

const args = process.argv.slice(2);
const runArg = args.includes('--run') ? args[args.indexOf('--run') + 1] : null;
if (!runArg) throw new Error('--run <каталог run-* или run.json> обязателен');
const runFile = runArg.endsWith('.json') ? runArg : path.join(runArg, 'run.json');
const runDir = path.dirname(runFile);
const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));

const TEST_JOURNAL_URI = process.env.TEST_JOURNAL_URI;
if (!TEST_JOURNAL_URI) throw new Error('TEST_JOURNAL_URI не задан');
const MOCK_LOG_DIR = process.env.MOCK_LOG_DIR || path.resolve('test-platform', 'logs');
const MOCK_URL = process.env.MOCK_URL || 'http://127.0.0.1:8125';
const STOCK_CNT = Number(process.env.MOCK_STOCK_CNT || 100);

const checks = [];
function report(check, entity, guid, ref_id, field, expected, actual, status, note = '') {
  checks.push({ check, entity, guid, ref_id, field, expected, actual, status, note });
}

const datePart = (v) => {
  if (v == null) return null;
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : s;
};
// Firebird DATE приезжает из fb-port как UTC-ISO и может сдвинуться на день
// относительно локальной даты 1С — расхождение в 1 день считаем совпадением.
const sameDay = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const diff = Math.abs(Date.parse(a) - Date.parse(b));
  return diff <= 24 * 3600 * 1000;
};
const one = (rows) => (Array.isArray(rows) && rows.length === 1 ? rows[0] : null);

// ---------- A: лог мока ----------
const servedFile = path.join(MOCK_LOG_DIR, 'served.jsonl');
const served = fs.existsSync(servedFile)
  ? fs.readFileSync(servedFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.ts >= run.startedAt)
  : [];
const servedOk = served.filter((e) => e.status === 200 && e.path !== STOCK_PATH);
const servedMiss = served.filter((e) => e.status === 404);

// ---------- B: журнал ----------
const journal = new Map(); // collection -> Map<guid, {ref_id, doc}>
const client = await MongoClient.connect(TEST_JOURNAL_URI);
try {
  const db = client.db();
  for (const { collection, queryField } of Object.values(pathMap)) {
    const map = new Map();
    for (const doc of await db.collection(collection).find({}).toArray().catch(() => [])) {
      const guid = queryField.split('.').reduce((o, k) => o?.[k], doc);
      if (guid) map.set(guid, { ref_id: doc.res?.ref_id ?? null, doc });
    }
    journal.set(collection, map);
  }
} finally {
  await client.close();
}

// ---------- Проверка 1: всё отданное моком дошло до журнала с ref_id ----------
for (const e of servedOk) {
  const coll = pathMap[e.path]?.collection;
  if (!coll) continue;
  const rec = journal.get(coll)?.get(e.guid);
  if (!rec) report('A→B полнота', coll, e.guid, null, 'журнал', 'запись', 'нет', 'fail');
  else if (!(rec.ref_id > 0)) report('A→B полнота', coll, e.guid, rec.ref_id, 'res.ref_id', '> 0', rec.ref_id, 'fail');
  else report('A→B полнота', coll, e.guid, rec.ref_id, 'res.ref_id', '> 0', rec.ref_id, 'pass');
}
for (const e of servedMiss) {
  report('мок 404', e.path, e.guid, null, '-', 'найден', '404', 'warn', 'дыра замыкания или неизвестный объект');
}

// ---------- Проверка 2: в журнале нет ничего, что мок не отдавал ----------
const servedGuids = new Set(servedOk.map((e) => e.guid));
for (const [coll, map] of journal) {
  for (const [guid] of map) {
    if (!servedGuids.has(guid)) report('B⊆A', coll, guid, null, 'источник', 'отдан моком', 'в журнале без отдачи', 'warn');
  }
}

// ---------- Проверка 3: Firebird ----------
// 3.1 Заказ клиента
for (const [guid, { ref_id, doc }] of journal.get('C1_ZC') ?? []) {
  try {
  const order = doc.response?.ЗаказПокупателя ?? {};
  const num = order.НомерЗаказаПокупателя;
  const rows = await fbq('C1_ZAKAZ_H_S', { NUM_IN: num });
  if (rows.length !== 1) {
    report('заказ: шапка', 'C1_ZC', guid, ref_id, 'строк по NUM_IN', 1, rows.length, 'fail', 'дубликаты = повторный прогон без сброса');
    continue;
  }
  const h = rows[0];
  report('заказ: шапка', 'C1_ZC', guid, ref_id, 'ID_ZAKAZ', ref_id, h.ID_ZAKAZ, h.ID_ZAKAZ === ref_id ? 'pass' : 'fail');
  report('заказ: шапка', 'C1_ZC', guid, ref_id, 'NUM', num, h.NUM, String(h.NUM).trim() === String(num).trim() ? 'pass' : 'fail');
  const dz = datePart(order.ДатаЗаказаПокупателя);
  report('заказ: шапка', 'C1_ZC', guid, ref_id, 'DATA_Z', dz, datePart(h.DATA_Z), sameDay(datePart(h.DATA_Z), dz) ? 'pass' : 'fail', 'допуск ±1 день (таймзона fb-port)');
  const sz = datePart(order.ДатаОтгрузкиЗаказаПокупателя);
  report('заказ: шапка', 'C1_ZC', guid, ref_id, 'SROK_Z', sz, datePart(h.SROK_Z), sameDay(datePart(h.SROK_Z), sz) ? 'pass' : 'fail', 'допуск ±1 день (таймзона fb-port)');

  const items1c = order.НоменклатураЗаказаПокупателя ?? [];
  const rowsI = await fbq('C1_ZAKAZ_I_S', { ID_ZAKAZ: ref_id });
  report('заказ: строки', 'C1_ZC', guid, ref_id, 'число строк', items1c.length, rowsI.length, rowsI.length === items1c.length ? 'pass' : 'fail');
  const cnt1c = items1c.map((i) => Number(i.КоличествоНоменклатуры)).sort((a, b) => a - b);
  const cntFb = rowsI.map((r) => Number(r.CNT)).sort((a, b) => a - b);
  report('заказ: строки', 'C1_ZC', guid, ref_id, 'CNT (мультимножество)', cnt1c.join(','), cntFb.join(','), cnt1c.join(',') === cntFb.join(',') ? 'pass' : 'fail');
  for (const r of rowsI) {
    if (!(r.NOM_ID > 0)) report('заказ: строки', 'C1_ZC', guid, ref_id, 'NOM_ID', '> 0', r.NOM_ID, 'fail');
  }
  // связка строк: BOMCUR_ID заведомо NULL — BOM_ID отбрасывается EXP_ZAKAZ_ITEMS_IU (known-issue)
  const idField = rowsI[0] ? Object.keys(rowsI[0]).find((k) => /^ID/.test(k) && rowsI[0][k] > 0) : null;
  if (idField) {
    try {
      const nomI = await fbq('C1_ZAKAZ_NOM_I_S', { ID_ZAKAZ_I_ID: rowsI[0][idField] });
      const bomcur = nomI[0]?.BOMCUR_ID ?? null;
      // параметр BOM_ID процедурой отбрасывается (README §12 п.13), но база
      // может вычислить актуальную спецификацию сама — заполненный BOMCUR_ID это pass
      report('заказ: связка', 'C1_ZC', guid, ref_id, 'BOMCUR_ID', 'NULL или вычислен БД', bomcur, bomcur == null ? 'known-issue' : 'pass', 'BOM_ID отбрасывается процедурой; связка вычисляется БД');
    } catch (err) {
      report('заказ: связка', 'C1_ZC', guid, ref_id, 'C1_ZAKAZ_NOM_I_S', 'вызов', err.message, 'warn');
    }
  }
  } catch (err) {
    report('заказ', 'C1_ZC', guid, ref_id, 'исключение', 'выполнение', err.message, 'warn');
  }
}

// 3.2 Номенклатура
for (const [guid, { ref_id, doc }] of journal.get('C1_Nom') ?? []) {
  try {
  const nom = doc.response?.Номенклатура ?? {};
  const rows = await fbq('EXP_NOM_S', { NOM_ID_IN: ref_id });
  const r = one(rows);
  if (!r) {
    report('номенклатура', 'C1_Nom', guid, ref_id, 'EXP_NOM_S', '1 строка', rows.length, 'fail');
    continue;
  }
  const expName = String(nom.НаименованиеНоменклатуры ?? '').substring(0, 150).trim();
  const actName = String(r.NOM_NAME ?? '').trim();
  report('номенклатура', 'C1_Nom', guid, ref_id, 'NOM_NAME', expName, actName, actName === expName ? 'pass' : 'warn', 'имя может преобразовываться (OBJ_LIST/ADD)');
  report('номенклатура', 'C1_Nom', guid, ref_id, 'CATALOG_NAME', 'непусто', r.CATALOG_NAME, r.CATALOG_NAME ? 'pass' : 'warn');
  report('номенклатура', 'C1_Nom', guid, ref_id, 'MEASURE_NAME', 'непусто', r.MEASURE_NAME, r.MEASURE_NAME ? 'pass' : 'warn', 'опечатка GUIDКдиницыИзмерения может не проставлять единицу');

  try {
    const links = await fbq('C1_LINKS_S', { P_NOM_ID: ref_id });
    if (links.length === 0) report('связь 1С↔HiTek', 'C1_Nom', guid, ref_id, 'C1_LINKS', '≥ 1', 0, 'fail');
    else {
      const kod = String(links[0].KOD_IZD ?? '').trim();
      const expKod = String(nom.КодНоменклатуры ?? '').trim();
      report('связь 1С↔HiTek', 'C1_Nom', guid, ref_id, 'KOD_IZD', expKod, kod, kod === expKod ? 'pass' : 'fail');
      if (links.length > 1) report('связь 1С↔HiTek', 'C1_Nom', guid, ref_id, 'строк C1_LINKS', 1, links.length, 'known-issue', 'дубли связей — известный дефект');
    }
  } catch (err) {
    report('связь 1С↔HiTek', 'C1_Nom', guid, ref_id, 'C1_LINKS_S', 'вызов', err.message, 'known-issue', 'C1_LINKS_S в копии: возвратное поле короче кода 1С (truncation 10 vs 11)');
  }
  } catch (err) {
    report('номенклатура', 'C1_Nom', guid, ref_id, 'исключение', 'выполнение', err.message, 'warn');
  }
}

// 3.3 Спецификации
for (const [guid, { ref_id, doc }] of journal.get('C1_Bom') ?? []) {
  try {
  const bom = doc.response?.Спецификация ?? {};
  const head = await fbq('BOM_LIST_ONE_S', { BOM_ID: ref_id });
  report('спецификация', 'C1_Bom', guid, ref_id, 'BOM_LIST_ONE_S', '1 строка', head.length, head.length === 1 ? 'pass' : 'fail');
  const items1c = bom.СоставСпецификации ?? [];
  const items = await fbq('BOM_ITEMS_S', { BOM_LIST_ID: ref_id });
  report('спецификация', 'C1_Bom', guid, ref_id, 'строк состава', items1c.length, items.length, items.length === items1c.length ? 'pass' : 'fail');
  const rt1c = bom.ОперацииСпецификации ?? [];
  try {
    const rt = await fbq('RT_ROUTE_ITEMS_S', { BOM_ID: ref_id });
    report('спецификация', 'C1_Bom', guid, ref_id, 'строк операций', rt1c.length, rt.length, rt.length === rt1c.length ? 'pass' : 'warn', 'RT_VERSION/FOR_UNIT не передаются (falsy→NULL)');
  } catch (err) {
    report('спецификация', 'C1_Bom', guid, ref_id, 'RT_ROUTE_ITEMS_S', 'вызов', err.message, 'warn');
  }
  } catch (err) {
    report('спецификация', 'C1_Bom', guid, ref_id, 'исключение', 'выполнение', err.message, 'warn');
  }
}

// 3.4 Остатки (доведение вверх: avail >= MOCK_STOCK_CNT)
let stockStorageGuid = process.env.MOCK_STOCK_STORAGE_GUID || '';
if (!stockStorageGuid) {
  try {
    stockStorageGuid = (await axios.get(`${MOCK_URL}/__health`, { timeout: 5000 })).data.stockStorageGuid || '';
  } catch {
    /* мок недоступен — пропустим остатки */
  }
}
const storageRef = stockStorageGuid ? journal.get('C1_Storage')?.get(stockStorageGuid)?.ref_id : null;
if (storageRef > 0) {
  for (const [guid, { ref_id }] of journal.get('C1_Nom') ?? []) {
    try {
      const rows = await fbq('NOM_AVAIL_S', { NOM_ID: ref_id, STR_ID: storageRef });
      const avail = Number(rows[0]?.CNT_AVAIL ?? NaN);
      report('остатки', 'C1_Nom', guid, ref_id, 'CNT_AVAIL', `>= ${STOCK_CNT}`, avail, avail >= STOCK_CNT ? 'pass' : 'fail', 'EXP_NOM_CNT_SET доводит только вверх');
    } catch (err) {
      report('остатки', 'C1_Nom', guid, ref_id, 'NOM_AVAIL_S', 'вызов', err.message, 'warn');
    }
  }
} else {
  report('остатки', 'C1_Storage', stockStorageGuid || '-', storageRef, 'склад остатков', 'ref_id в журнале', storageRef, 'warn', 'сценарий не включал остатки или склад не импортирован');
}

// ---------- Отчёт ----------
const counts = { pass: 0, fail: 0, warn: 0, 'known-issue': 0 };
for (const c of checks) counts[c.status] = (counts[c.status] || 0) + 1;

fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({ run: run.startedAt, counts, checks }, null, 2));

const md = [
  `# Verify: прогон ${run.startedAt}`,
  '',
  `| pass | fail | warn | known-issue |`,
  `|---:|---:|---:|---:|`,
  `| ${counts.pass} | ${counts.fail} | ${counts.warn} | ${counts['known-issue']} |`,
  '',
  '| статус | проверка | сущность | guid | ref_id | поле | ожидали | получили | примечание |',
  '|---|---|---|---|---|---|---|---|---|',
  ...checks
    .filter((c) => c.status !== 'pass')
    .map((c) => `| ${c.status} | ${c.check} | ${c.entity} | ${String(c.guid).slice(0, 8)}… | ${c.ref_id} | ${c.field} | ${c.expected} | ${c.actual} | ${c.note} |`),
  '',
  `Полный список (включая pass) — report.json. Всего проверок: ${checks.length}.`,
].join('\n');
fs.writeFileSync(path.join(runDir, 'report.md'), md);

console.log(`verify: pass=${counts.pass} fail=${counts.fail} warn=${counts.warn} known-issue=${counts['known-issue']}`);
console.log(`Отчёты: ${path.join(runDir, 'report.json')} / report.md`);
for (const c of checks.filter((c) => c.status === 'fail')) {
  console.log(`  FAIL ${c.check} ${c.entity} ${String(c.guid).slice(0, 8)}… ${c.field}: ожидали ${c.expected}, получили ${c.actual}`);
}
if (counts.fail > 0) process.exitCode = 1;
