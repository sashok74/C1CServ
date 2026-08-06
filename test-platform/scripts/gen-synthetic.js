// Генератор синтетического набора: 3 заказа с контрагентами, номенклатурой,
// группами каталога, единицами измерения, участком и спецификациями, которых
// НЕТ ни в журнале, ни в базе HiTek — тестирует ветку «создание с нуля»
// (EXP_NOM_IU → obj_list_iu/nom_list_item_i, EXP_FIRM_IU, EXP_CATALOG_IU...).
//
// Пишет:
//   - JSON-файлы мока в MOCK_FILES_DIR/<путь>/<GUID>.json (файлы приоритетнее mongo);
//   - сценарий test-platform/scenarios/order-synthetic.json c блоком expect
//     (точные ожидания для verify: имена, коды, группы, единицы, заказчики).
//
// Имена полей 1С (включая исторические опечатки GUIDКдиницыИзмерения,
// GUIDEдиницыИзмерения, НоменклатураCпецификации, СпецфикацияДляНоменклатуры,
// GUIDУчастка) синхронизированы с src/types/ExportSchemes.ts — при запуске
// выполняется санити-проверка, что все строки присутствуют в схемах.
import fs from 'fs';
import path from 'path';

const FILES_DIR = process.env.MOCK_FILES_DIR || path.resolve('test-platform', 'mock-files');
const SCENARIO_FILE = path.resolve('test-platform', 'scenarios', 'order-synthetic.json');
const SCHEMES_FILE = path.resolve('src', 'types', 'ExportSchemes.ts');

// --- санити-проверка имён полей по схемам ---
const REQUIRED_FIELD_NAMES = [
  'GUIDЗаказаПокупателя', 'НомерЗаказаПокупателя', 'ДатаЗаказаПокупателя', 'ДатаОтгрузкиЗаказаПокупателя',
  'КонтрагентЗаказаПокупателя', 'GUIDКонтрагента', 'НоменклатураЗаказаПокупателя',
  'КоличествоНоменклатуры', 'КоличествоНоменклатурыИзготовлено', 'СпецификацияНоменклатуры',
  'GUIDНоменклатуры', 'НаименованиеНоменклатуры', 'КодНоменклатуры', 'АртикулНоменклатуры',
  'ЕдиницаИзмеренияНоменклатуры', 'GUIDКдиницыИзмерения', 'ГруппаНоменклатуры', 'GUIDГруппыНоменклатуры',
  'НаименованиеГруппыНоменклатуры', 'РодительГруппыНоменклатуры',
  'GUIDEдиницыИзмерения', 'СокращениеЕдиницыИзмерения', 'КодЕдиницыИзмерения', 'НаименованиеЕдиницыИзмерения',
  'GUIDСтруктурнойЕдиницы', 'НаименованиеСтруктурнойЕдиницы',
  'GUIDСпецификации', 'НоменклатураCпецификации', 'Комментарий', 'УчастокПроизводства', 'GUIDУчастка',
  'СоставСпецификации', 'НоменклатураСостава', 'Количество', 'НомерСтроки',
  'ОперацииСпецификации', 'НоменклатураОпераций', 'НормаВремени',
];
const schemesSrc = fs.readFileSync(SCHEMES_FILE, 'utf8');
for (const name of REQUIRED_FIELD_NAMES) {
  if (!schemesSrc.includes(name)) throw new Error(`поле "${name}" не найдено в ExportSchemes.ts — рассинхрон генератора со схемами`);
}

// --- детерминированные GUID: 5e57<тип>-0000-4000-9000-<номер> ---
const TYPE = { order: '0001', partner: '0002', nom: '0003', catalog: '0004', measure: '0005', storage: '0006', bom: '0007' };
const g = (type, n) => `5e57${TYPE[type]}-0000-4000-9000-${String(n).padStart(12, '0')}`;

// --- справочники ---
const measures = [
  { guid: g('measure', 1), short: 'SYNшт', code: 'S01', name: 'SYN штука' },
  { guid: g('measure', 2), short: 'SYNкмп', code: 'S02', name: 'SYN комплект' },
];
const catalogs = [
  { guid: g('catalog', 0), name: 'SYN Изделия', parent: null },
  { guid: g('catalog', 1), name: 'SYN Платы', parent: g('catalog', 0) },
  { guid: g('catalog', 2), name: 'SYN Компоненты', parent: g('catalog', 0) },
  { guid: g('catalog', 3), name: 'SYN Разное', parent: null },
];
const storage = { guid: g('storage', 1), name: 'SYN Участок сборки' };
const partners = [
  { guid: g('partner', 1), name: 'SYN ООО Альфа Тест', code: 'SYN-P001', inn: '7700000001' },
  { guid: g('partner', 2), name: 'SYN АО Бета Электро', code: 'SYN-P002', inn: '7700000002' },
  { guid: g('partner', 3), name: 'SYN ИП Гамма', code: 'SYN-P003', inn: '770000000103' },
];
// exact=false — чип-компоненты: имя парсится в ADD, EXP_NOM_IU может привязать их
// к существующему OBJ_LIST («Конденсатор чип CC»), точные группа/единица не гарантированы
const noms = [
  { n: 1, name: 'SYN Плата управления А1', cat: 1, mea: 0, exact: true },
  { n: 2, name: 'Конденсатор чип CC 100nF ±10% 50v X7R (0805) SYN', cat: 2, mea: 1, exact: false },
  { n: 3, name: 'Резистор чип RC 0805 10k ±5% SYN', cat: 2, mea: 1, exact: false },
  { n: 4, name: 'SYN Корпус прибора К-2', cat: 3, mea: 0, exact: true },
  { n: 5, name: 'SYN Кабель интерфейсный КИ-1', cat: 3, mea: 0, exact: true },
  { n: 6, name: 'SYN Блок питания БП-24', cat: 1, mea: 0, exact: true },
  { n: 7, name: 'SYN Трансформатор Т-24', cat: 2, mea: 1, exact: true },
  { n: 8, name: 'SYN Диодный мост ДМ-1', cat: 2, mea: 1, exact: true },
].map((x) => ({ ...x, guid: g('nom', x.n), kod: `SYN-${String(x.n).padStart(5, '0')}`, art: `SYNART-${x.n}` }));
const nomBy = (n) => noms.find((x) => x.n === n);

const boms = [
  {
    guid: g('bom', 1), forNom: 1, comment: 'SYN спецификация платы',
    items: [{ nom: 2, cnt: 4, ord: 1 }, { nom: 3, cnt: 2, ord: 2 }],
    ops: [{ ord: 1, name: 'SYN Монтаж SMD', time: 0.5 }],
  },
  {
    guid: g('bom', 2), forNom: 6, comment: 'SYN спецификация БП',
    items: [{ nom: 7, cnt: 1, ord: 1 }, { nom: 8, cnt: 1, ord: 2 }],
    ops: [{ ord: 1, name: 'SYN Сборка', time: 1.25 }, { ord: 2, name: 'SYN Проверка', time: 0.75 }],
  },
];
const orders = [
  { guid: g('order', 1), num: 'SYN-001', partner: 0, items: [{ nom: 1, cnt: 2, bom: g('bom', 1) }, { nom: 2, cnt: 100 }] },
  { guid: g('order', 2), num: 'SYN-002', partner: 1, items: [{ nom: 4, cnt: 5 }, { nom: 5, cnt: 10 }] },
  { guid: g('order', 3), num: 'SYN-003', partner: 2, items: [{ nom: 6, cnt: 1, bom: g('bom', 2) }] },
];
const DATE_Z = '2026-08-01T00:00:00';
const DATE_SHIP = '2026-08-15T00:00:00';

// --- запись файлов мока ---
let written = 0;
function writeMock(endpoint, guid, doc) {
  const dir = path.join(FILES_DIR, endpoint);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${guid}.json`), JSON.stringify(doc, null, 2));
  written++;
}

for (const m of measures) {
  writeMock('get_measure', m.guid, {
    response: {
      ЕдиницаИзмерения: {
        GUIDEдиницыИзмерения: m.guid,
        СокращениеЕдиницыИзмерения: m.short,
        КодЕдиницыИзмерения: m.code,
        НаименованиеЕдиницыИзмерения: m.name,
      },
    },
  });
}
for (const c of catalogs) {
  const body = { GUIDГруппыНоменклатуры: c.guid, НаименованиеГруппыНоменклатуры: c.name };
  if (c.parent) body.РодительГруппыНоменклатуры = { GUIDГруппыНоменклатуры: c.parent };
  writeMock('get_nomenclature_group', c.guid, { response: { ГруппаНоменклатуры: body } });
}
writeMock('get_organizational_unit', storage.guid, {
  response: { СтруктурноеПодразделение: { GUIDСтруктурнойЕдиницы: storage.guid, НаименованиеСтруктурнойЕдиницы: storage.name } },
});
for (const p of partners) {
  writeMock('get_partner', p.guid, {
    response: {
      Контрагент: {
        GUIDКонтрагента: p.guid,
        НаименованиеКонтрагента: p.name,
        КодКонтрагента: p.code,
        АдресКонтрагентаПолный: 'SYN г. Тестоград, ул. Синтетическая, 1',
        НаименованиеКонтактногоЛицаКонтрагента: 'SYN Тестов Т.Т.',
        ИННКонтрагента: p.inn,
        КППКонтрагента: '770001001',
        ОКПОКонтрагента: '',
      },
    },
  });
}
for (const x of noms) {
  writeMock('get_nomenclature', x.guid, {
    response: {
      Номенклатура: {
        GUIDНоменклатуры: x.guid,
        НаименованиеНоменклатуры: x.name,
        КодНоменклатуры: x.kod,
        АртикулНоменклатуры: x.art,
        ШтрихкодНоменклатуры: '',
        ЕдиницаИзмеренияНоменклатуры: { GUIDКдиницыИзмерения: measures[x.mea].guid },
        ГруппаНоменклатуры: { GUIDГруппыНоменклатуры: catalogs[x.cat].guid },
      },
    },
  });
}
for (const b of boms) {
  writeMock('get_specification', b.guid, {
    response: {
      Спецификация: {
        GUIDСпецификации: b.guid,
        НоменклатураCпецификации: { GUIDНоменклатуры: nomBy(b.forNom).guid },
        Комментарий: b.comment,
        УчастокПроизводства: { GUIDУчастка: storage.guid },
        СоставСпецификации: b.items.map((i) => ({
          НомерСтроки: i.ord,
          Количество: i.cnt,
          НоменклатураСостава: { GUIDНоменклатуры: nomBy(i.nom).guid },
        })),
        ОперацииСпецификации: b.ops.map((o) => ({
          НомерСтроки: o.ord,
          НормаВремени: o.time,
          НоменклатураОпераций: { НаименованиеНоменклатуры: o.name },
        })),
      },
    },
  });
}
for (const z of orders) {
  writeMock('get_order', z.guid, {
    response: {
      ЗаказПокупателя: {
        GUIDЗаказаПокупателя: z.guid,
        НомерЗаказаПокупателя: z.num,
        ДатаЗаказаПокупателя: DATE_Z,
        ДатаОтгрузкиЗаказаПокупателя: DATE_SHIP,
        КонтрагентЗаказаПокупателя: { GUIDКонтрагента: partners[z.partner].guid },
        НоменклатураЗаказаПокупателя: z.items.map((i) => {
          const row = {
            Номенклатура: { GUIDНоменклатуры: nomBy(i.nom).guid },
            ЕдиницаИзмеренияНоменклатуры: { GUIDКдиницыИзмерения: measures[nomBy(i.nom).mea].guid },
            КоличествоНоменклатуры: i.cnt,
            КоличествоНоменклатурыИзготовлено: 0,
          };
          if (i.bom) row.СпецификацияНоменклатуры = { GUIDСпецификации: i.bom };
          return row;
        }),
      },
    },
  });
}

// --- сценарий с ожиданиями для verify ---
const scenario = {
  name: 'order-synthetic',
  steps: [{ route: '/C1_ZC', body: { DOC: orders.map((z) => z.guid) } }],
  closure: {},
  unresolved: [],
  expect: {
    synthetic: true,
    orders: Object.fromEntries(
      orders.map((z) => [z.guid, { num: z.num, partnerName: partners[z.partner].name, itemCount: z.items.length }]),
    ),
    noms: Object.fromEntries(
      noms.map((x) => [
        x.guid,
        {
          // чип-компоненты (exact:false): HiTek канонизирует имя из распарсенных
          // параметров («Конденсатор чип CC-100nF-…») — сверяем только префикс паттерна
          name: x.exact ? x.name : null,
          namePrefix: x.exact ? null : x.name.split(' ').slice(0, 3).join(' '),
          kod: x.kod,
          catalogName: x.exact ? catalogs[x.cat].name : null,
          measureName: x.exact ? measures[x.mea].short : null,
        },
      ]),
    ),
  },
};
fs.mkdirSync(path.dirname(SCENARIO_FILE), { recursive: true });
fs.writeFileSync(SCENARIO_FILE, JSON.stringify(scenario, null, 2));

console.log(`gen-synthetic: записано ${written} файлов мока в ${FILES_DIR}`);
console.log(`Набор: 3 заказа, ${partners.length} контрагента, ${noms.length} номенклатур, ${catalogs.length} группы, ${measures.length} единицы, 1 участок, ${boms.length} спецификации`);
console.log(`Сценарий: ${SCENARIO_FILE}`);
console.log('Прогон (после полного сброса!): node test-platform/scripts/run-all.js --scenario test-platform/scenarios/order-synthetic.json');
