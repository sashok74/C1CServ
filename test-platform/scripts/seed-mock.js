// Засев базы мока c1_mock из ПРОД-журнала c1_data (только чтение: find()).
// Режимы:
//   --all            выгрузить все коллекции журнала в SEED_DIR/*.jsonl и залить в c1_mock
//   --order <GUID>   только транзитивное замыкание одного заказа (компактный golden-набор)
//   --load-only      залить уже имеющиеся jsonl из SEED_DIR без похода в прод
// Окружение:
//   SEED_SRC_URI  mongodb://ind:...@192.168.7.104:27017/c1_data?authSource=c1_data (не нужен при --load-only)
//   SEED_DST_URI  mongodb://ind:...@127.0.0.1:27017/c1_mock?authSource=c1_mock
//   SEED_DIR      каталог jsonl (по умолчанию /srv/c1-test/seed)
import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import { pathMap } from '../mock-1c/pathMap.js';
import { buildClosure } from './closure.js';

const SEED_DIR = process.env.SEED_DIR || '/srv/c1-test/seed';
const COLLECTIONS = [...new Set(Object.values(pathMap).map((m) => m.collection))];

const args = process.argv.slice(2);
const mode = args.includes('--load-only') ? 'load-only' : args.includes('--order') ? 'order' : 'all';
const orderGuid = mode === 'order' ? args[args.indexOf('--order') + 1] : null;

function jsonlPath(collection) {
  return path.join(SEED_DIR, `${collection}.jsonl`);
}

function writeJsonl(collection, docs) {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  const clean = docs.map((d) => {
    const { _id, ...rest } = d;
    return rest;
  });
  fs.writeFileSync(jsonlPath(collection), clean.map((d) => JSON.stringify(d)).join('\n') + (clean.length ? '\n' : ''));
  return clean.length;
}

async function dumpFromProd() {
  const srcUri = process.env.SEED_SRC_URI;
  if (!srcUri) throw new Error('SEED_SRC_URI не задан');
  const client = await MongoClient.connect(srcUri);
  try {
    const db = client.db();
    if (mode === 'order') {
      const { collection, queryField } = pathMap.get_order;
      const { docs, unresolved } = await buildClosure(db, collection, queryField, orderGuid);
      if (!docs.size) throw new Error(`заказ ${orderGuid} не найден в ${collection}`);
      for (const [coll, list] of docs) console.log(`  ${coll}: ${writeJsonl(coll, list)} док.`);
      for (const coll of COLLECTIONS) if (!docs.has(coll)) writeJsonl(coll, []);
      if (unresolved.length) {
        console.log(`  ⚠ неразрешённые GUID (${unresolved.length}) — мок ответит на них 404:`);
        for (const g of unresolved) console.log(`    ${g}`);
      }
    } else {
      for (const coll of COLLECTIONS) {
        const docs = await db.collection(coll).find({}).toArray();
        console.log(`  ${coll}: ${writeJsonl(coll, docs)} док.`);
      }
    }
  } finally {
    await client.close();
  }
}

async function loadToMock() {
  const dstUri = process.env.SEED_DST_URI;
  if (!dstUri) throw new Error('SEED_DST_URI не задан');
  const client = await MongoClient.connect(dstUri);
  try {
    const db = client.db();
    for (const coll of COLLECTIONS) {
      const file = jsonlPath(coll);
      if (!fs.existsSync(file)) continue;
      const docs = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      await db.collection(coll).deleteMany({});
      if (docs.length) await db.collection(coll).insertMany(docs);
      console.log(`  c1_mock.${coll}: залито ${docs.length}`);
    }
    const st = await db.collection('C1_Storage').findOne({});
    const guid = st?.response?.СтруктурноеПодразделение?.GUIDСтруктурнойЕдиницы;
    if (guid) console.log(`\nПодсказка: MOCK_STOCK_STORAGE_GUID=${guid}`);
  } finally {
    await client.close();
  }
}

console.log(`seed-mock: режим ${mode}${orderGuid ? ` (${orderGuid})` : ''}, SEED_DIR=${SEED_DIR}`);
if (mode !== 'load-only') await dumpFromProd();
await loadToMock();
console.log('seed-mock: готово');
