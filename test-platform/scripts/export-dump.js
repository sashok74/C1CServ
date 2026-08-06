// Снимает выгрузку HiTek -> 1С (маршруты /exp2/v1/*) и кладёт её рядом с отчётом
// прогона: сырой JSON по каждому эндпоинту + человекочитаемый export.md.
//
//   --out <каталог>   куда писать (по умолчанию — последний каталог RUN_DIR/run-*)
//   --full            выгрузить всё постранично (иначе — обзорные лимиты)
//
// Окружение: C1CSERV_URL, RUN_DIR.
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const C1CSERV_URL = process.env.C1CSERV_URL || 'http://127.0.0.1:3738';
const RUN_DIR = process.env.RUN_DIR || path.resolve('test-platform', 'reports');

const args = process.argv.slice(2);
const full = args.includes('--full');
let outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
if (!outDir) {
  const runs = fs.existsSync(RUN_DIR) ? fs.readdirSync(RUN_DIR).filter((d) => d.startsWith('run-')).sort() : [];
  outDir = runs.length ? path.join(RUN_DIR, runs[runs.length - 1], 'export') : path.join(RUN_DIR, 'export');
}
fs.mkdirSync(outDir, { recursive: true });

// обзорные лимиты: столько, чтобы глазами было видно суть, но файл не распухал
const ENDPOINTS = [
  { key: 'state', url: '/exp2/v1/state', paged: false },
  { key: 'storages', url: '/exp2/v1/storages', paged: false },
  { key: 'nomenclature', url: '/exp2/v1/nomenclature', paged: true, limit: full ? 1000 : 200 },
  { key: 'specifications', url: '/exp2/v1/specifications', paged: true, limit: full ? 2000 : 200 },
  { key: 'requirements', url: '/exp2/v1/requirements', paged: true, limit: 500 },
  { key: 'transfers', url: '/exp2/v1/transfers', paged: true, limit: 500 },
];

async function fetchAll(ep) {
  if (!ep.paged) {
    const { data } = await axios.get(`${C1CSERV_URL}${ep.url}`, { timeout: 120000 });
    return data;
  }
  const items = [];
  let cursor = null;
  let pages = 0;
  let last = null;
  do {
    const url = `${C1CSERV_URL}${ep.url}?limit=${ep.limit}${cursor ? `&cursor=${cursor}` : ''}`;
    const { data } = await axios.get(url, { timeout: 300000 });
    const p = data?.response?.ПакетВыгрузки;
    if (!p) break;
    items.push(...(p.Элементы || []));
    cursor = p.Курсор;
    last = p;
    pages++;
  } while (full && last?.ЕстьЕще && pages < 100);
  return {
    response: {
      ПакетВыгрузки: {
        Сущность: last?.Сущность ?? ep.key,
        Курсор: cursor,
        ЕстьЕще: last?.ЕстьЕще ?? false,
        Количество: items.length,
        Страниц: pages,
        Элементы: items,
      },
    },
  };
}

const dump = {};
const errors = [];
for (const ep of ENDPOINTS) {
  try {
    const data = await fetchAll(ep);
    dump[ep.key] = data;
    fs.writeFileSync(path.join(outDir, `${ep.key}.json`), JSON.stringify(data, null, 2));
    const p = data?.response?.ПакетВыгрузки;
    console.log(`  ${ep.key}: ${p ? p.Количество : 'ok'}`);
  } catch (err) {
    const msg = err.response?.data?.detail || err.message;
    errors.push({ endpoint: ep.url, error: msg });
    console.error(`  ${ep.key}: ОШИБКА ${msg}`);
  }
}

// ---------- человекочитаемый отчёт ----------
const el = (k) => dump[k]?.response?.ПакетВыгрузки?.Элементы ?? [];
const cnt = (k) => dump[k]?.response?.ПакетВыгрузки?.Количество ?? 0;
const md = [];
const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

md.push(`# Выгрузка HiTek → 1С — снимок ${new Date().toISOString()}`);
md.push('');
md.push(`Источник: \`${C1CSERV_URL}/exp2/v1/*\`. Режим: ${full ? 'полный' : 'обзорный (лимиты)'}.`);
md.push('');
md.push('| Что выгружено | Элементов |');
md.push('|---|---:|');
md.push(`| Номенклатура с кодами 1С | ${cnt('nomenclature')} |`);
md.push(`| Складские единицы | ${cnt('storages')} |`);
md.push(`| Спецификации (состав изделий) | ${cnt('specifications')} |`);
md.push(`| Требование-накладная (расход в производство) | ${cnt('requirements')} |`);
md.push(`| Перемещение товаров | ${cnt('transfers')} |`);
md.push('');

if (errors.length) {
  md.push('## Ошибки');
  md.push('');
  for (const e of errors) md.push(`- \`${e.endpoint}\` — ${esc(e.error)}`);
  md.push('');
}

// документы — главное, что смотрят глазами
for (const [key, title] of [['requirements', 'Требование-накладная (расход материалов в производство)'], ['transfers', 'Перемещение товаров']]) {
  const docs = el(key);
  md.push(`## ${title}`);
  md.push('');
  if (!docs.length) {
    md.push('_Нет данных._');
    md.push('');
    continue;
  }
  for (const d of docs) {
    md.push(`### Документ HiTek № ${esc(d.ИдHiTek)} от ${esc(String(d.ДатаДокумента).slice(0, 10))}`);
    md.push('');
    if (d.Продукция) {
      md.push(`- **Продукция (субконто 20.01):** ${esc(d.Продукция.Наименование)} — код 1С \`${esc(d.Продукция.КодНоменклатуры)}\`, запуск ${esc(d.Продукция.РазмерЗапуска)}`);
    }
    if (d.Склад) md.push(`- **Склад:** ${esc(d.Склад.Наименование)} (ид ${esc(d.Склад.ИдHiTek)})`);
    if (d.СкладОтправитель) md.push(`- **Откуда:** ${esc(d.СкладОтправитель.Наименование)} → **Куда:** ${esc(d.СкладПолучатель?.Наименование)}`);
    md.push(`- **Проведён в HiTek:** ${d.Проведен ? 'да' : 'нет'}`);
    if (d.Комментарий) md.push(`- **Комментарий:** ${esc(d.Комментарий)}`);
    md.push('');
    md.push('| № движения | Код 1С | Номенклатура | Кол-во | Ед. | Разбор вручную |');
    md.push('|---|---|---|---:|---|---|');
    for (const s of d.Строки ?? []) {
      const n = s.Номенклатура ?? {};
      md.push(`| ${esc(s.ИдДвижения)} | ${esc(n.КодНоменклатуры)} | ${esc(n.Наименование)} | ${esc(s.Количество)} | ${esc(n.ЕдиницаИзмерения)} | ${n.ТребуетРучногоРазбора ? '**да**' : 'нет'} |`);
    }
    md.push('');
  }
}

// спецификации — показываем первые две целиком, остальное счётчиком
const specs = el('specifications');
md.push('## Спецификации');
md.push('');
if (!specs.length) md.push('_Нет данных._');
else {
  md.push(`Всего в снимке: ${specs.length}. Ниже — первые ${Math.min(2, specs.length)} целиком.`);
  md.push('');
  for (const s of specs.slice(0, 2)) {
    md.push(`### ${esc(s.Продукция?.Наименование)} — код 1С \`${esc(s.Продукция?.КодНоменклатуры)}\` (спец. ${esc(s.ИдHiTek)})`);
    md.push('');
    md.push('| № | Код 1С | Компонент | Кол-во | Ед. |');
    md.push('|---|---|---|---:|---|');
    for (const it of (s.Состав ?? []).slice(0, 25)) {
      const n = it.Номенклатура ?? {};
      md.push(`| ${esc(it.НомерСтроки)} | ${esc(n.КодНоменклатуры)} | ${esc(n.Наименование)} | ${esc(it.Количество)} | ${esc(n.ЕдиницаИзмерения)} |`);
    }
    if ((s.Состав ?? []).length > 25) md.push(`| … | | ещё ${s.Состав.length - 25} строк | | |`);
    md.push('');
  }
}

// номенклатура — таблица начала списка + отдельно проблемные позиции
const noms = el('nomenclature');
md.push('## Номенклатура (первые 15 из снимка)');
md.push('');
md.push('| Ид HiTek | Код 1С | Наименование | Ед. | Корень каталога | Спец. |');
md.push('|---|---|---|---|---|---|');
for (const n of noms.slice(0, 15)) {
  md.push(`| ${esc(n.ИдHiTek)} | ${esc(n.КодНоменклатуры)} | ${esc(n.Наименование)} | ${esc(n.ЕдиницаИзмерения)} | ${esc(n.КореньКаталога)} | ${n.ЕстьСпецификация ? 'да' : ''} |`);
}
md.push('');
const bad = noms.filter((n) => n.ТребуетРучногоРазбора);
md.push(`## Позиции, требующие ручного разбора: ${bad.length} из ${noms.length}`);
md.push('');
md.push('Код 1С не найден либо у позиции несколько разных кодов — такие строки нельзя грузить в 1С молча.');
md.push('');
if (bad.length) {
  md.push('| Ид HiTek | Код 1С | Наименование |');
  md.push('|---|---|---|');
  for (const n of bad.slice(0, 20)) md.push(`| ${esc(n.ИдHiTek)} | ${esc(n.КодНоменклатуры) || '_нет_'} | ${esc(n.Наименование)} |`);
  if (bad.length > 20) md.push(`| … | | ещё ${bad.length - 20} |`);
  md.push('');
}

// склады
md.push('## Складские единицы');
md.push('');
md.push('| Ид | Наименование | Движений | Позиций | Последнее движение |');
md.push('|---|---|---:|---:|---|');
for (const s of el('storages')) {
  md.push(`| ${esc(s.ИдHiTek)} | ${esc(s.Наименование)} | ${esc(s.ДвиженийВсего)} | ${esc(s.НоменклатурныхПозиций)} | ${esc(String(s.ПоследнееДвижение ?? '').slice(0, 10))} |`);
}
md.push('');
md.push('---');
md.push('');
md.push(`Сырые ответы сервиса — рядом: ${ENDPOINTS.map((e) => `\`${e.key}.json\``).join(', ')}.`);

fs.writeFileSync(path.join(outDir, 'export.md'), md.join('\n'));

console.log(`export-dump: снимок в ${outDir}`);
console.log(`  посмотреть глазами: ${path.join(outDir, 'export.md')}`);
if (errors.length) process.exitCode = 1;
