// Выбор связного набора GUID для сценария из базы мока c1_mock.
//   --guid <GUID>   конкретный заказ
//   --auto          первый заказ с 1..5 позициями
//   --out <file>    куда писать сценарий (по умолчанию test-platform/scenarios/order-basic.json)
// Печатает состав замыкания и список «дыр» (GUID без документа — мок ответит 404 → err 40).
import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import { pathMap } from '../mock-1c/pathMap.js';
import { buildClosure } from './closure.js';

const args = process.argv.slice(2);
const outFile =
  args.includes('--out') ? args[args.indexOf('--out') + 1] : path.resolve('test-platform', 'scenarios', 'order-basic.json');
const uri = process.env.SEED_DST_URI;
if (!uri) throw new Error('SEED_DST_URI не задан (mongodb://...c1_mock)');

const client = await MongoClient.connect(uri);
try {
  const db = client.db();
  const { collection, queryField } = pathMap.get_order;

  let orderDoc;
  if (args.includes('--guid')) {
    const guid = args[args.indexOf('--guid') + 1];
    orderDoc = await db.collection(collection).findOne({ [queryField]: guid });
    if (!orderDoc) throw new Error(`заказ ${guid} не найден в c1_mock.${collection}`);
  } else {
    const cursor = db.collection(collection).find({});
    for await (const doc of cursor) {
      const items = doc.response?.ЗаказПокупателя?.НоменклатураЗаказаПокупателя;
      if (Array.isArray(items) && items.length >= 1 && items.length <= 5) {
        orderDoc = doc;
        break;
      }
    }
    if (!orderDoc) throw new Error('не найден заказ с 1..5 позициями (--auto)');
  }

  const order = orderDoc.response.ЗаказПокупателя;
  const guid = order.GUIDЗаказаПокупателя;
  console.log(`Заказ: ${order.НомерЗаказаПокупателя} от ${order.ДатаЗаказаПокупателя} (${guid})`);

  const { docs, unresolved } = await buildClosure(db, collection, queryField, guid);
  const closure = {};
  for (const [coll, list] of docs) {
    closure[coll] = list.map((d) => {
      const map = Object.values(pathMap).find((m) => m.collection === coll);
      return map.queryField.split('.').reduce((o, k) => o?.[k], d);
    });
    console.log(`  ${coll}: ${list.length}`);
  }
  if (unresolved.length) {
    console.log(`⚠ дыры замыкания (${unresolved.length}) — мок ответит 404, у C1CServ будет err 40:`);
    for (const g of unresolved) console.log(`  ${g}`);
  }

  const scenario = {
    name: path.basename(outFile, '.json'),
    order: { guid, num: order.НомерЗаказаПокупателя },
    steps: [{ route: '/C1_ZC', body: { DOC: [guid] } }],
    closure,
    unresolved,
  };
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(scenario, null, 2));
  console.log(`Сценарий записан: ${outFile}`);
} finally {
  await client.close();
}
