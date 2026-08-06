// Мок веб-сервиса 1С для тестовой платформы C1CServ.
// Отдаёт GET /unf/hs/ht/<путь>/<GUID> из двух источников (файлы приоритетнее):
//   1) каталог MOCK_FILES_DIR/<путь>/<GUID>.json — «закинуть набор файлов и проверить»;
//   2) локальная mongo-база c1_mock (засев из прод-журнала, scripts/seed-mock.js).
// Остатки (get_quantity_nomenclature) синтезируются, т.к. в журнале их нет.
// Каждый ответ пишется в json-lines лог — это эталон «что отдали» для verify.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
import { pathMap, STOCK_PATH } from './pathMap.js';
import { cleanDoc } from './clean.js';
import { buildStockResponse } from './stock.js';
import { ServedLog } from './servedLog.js';

const PORT = Number(process.env.MOCK_PORT || 8125);
const BIND = process.env.MOCK_BIND || '127.0.0.1';
const FILES_DIR = process.env.MOCK_FILES_DIR || path.resolve('test-platform', 'mock-files');
const LOG_DIR = process.env.MOCK_LOG_DIR || path.resolve('test-platform', 'logs');
const MONGO_URI = process.env.MOCK_MONGO_URI || '';
const STOCK_CNT = Number(process.env.MOCK_STOCK_CNT || 100);
const STOCK_RES = Number(process.env.MOCK_STOCK_RES || 0);
const STOCK_PRICE = Number(process.env.MOCK_STOCK_PRICE || 0);
let stockStorageGuid = process.env.MOCK_STOCK_STORAGE_GUID || '';

const log = new ServedLog(LOG_DIR);
const app = express();

let mongoDb = null;
if (MONGO_URI) {
  try {
    const client = await MongoClient.connect(MONGO_URI);
    mongoDb = client.db();
    console.log(`mock-1c: mongo source connected (${mongoDb.databaseName})`);
  } catch (err) {
    console.error('mock-1c: mongo source unavailable:', err.message);
  }
} else {
  console.log('mock-1c: MOCK_MONGO_URI не задан — режим только файлов');
}

function readFileSource(endpoint, guid) {
  const file = path.join(FILES_DIR, endpoint, `${guid}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function readMongoSource(endpoint, guid) {
  if (!mongoDb) return null;
  const map = pathMap[endpoint];
  if (!map) return null;
  return mongoDb.collection(map.collection).findOne({ [map.queryField]: guid });
}

async function pickDefaultStorage() {
  if (stockStorageGuid || !mongoDb) return;
  const doc = await mongoDb.collection('C1_Storage').findOne({});
  if (doc) {
    stockStorageGuid = doc.response?.СтруктурноеПодразделение?.GUIDСтруктурнойЕдиницы || '';
    console.log(`mock-1c: MOCK_STOCK_STORAGE_GUID не задан, выбран первый склад: ${stockStorageGuid}`);
  }
}

async function stockHandler(guid) {
  const fileDoc = readFileSource(STOCK_PATH, guid);
  if (fileDoc) return { doc: fileDoc, source: 'file' };

  await pickDefaultStorage();
  if (!stockStorageGuid) return { doc: null, source: 'stock-no-storage' };

  let nomName = `MOCK ${guid}`;
  let storageName = 'MOCK склад';
  if (mongoDb) {
    const nom = await mongoDb.collection('C1_Nom').findOne({ [pathMap.get_nomenclature.queryField]: guid });
    if (nom) nomName = nom.response?.Номенклатура?.НаименованиеНоменклатуры || nomName;
    const st = await mongoDb
      .collection('C1_Storage')
      .findOne({ [pathMap.get_organizational_unit.queryField]: stockStorageGuid });
    if (st) storageName = st.response?.СтруктурноеПодразделение?.НаименованиеСтруктурнойЕдиницы || storageName;
  }
  const doc = buildStockResponse({
    guid,
    nomName,
    storage: { guid: stockStorageGuid, name: storageName },
    cnt: STOCK_CNT,
    res: STOCK_RES,
    price: STOCK_PRICE,
  });
  return { doc, source: 'stock-synth' };
}

app.get('/unf/hs/ht/:endpoint/:guid', async (req, res) => {
  const { endpoint, guid } = req.params;
  try {
    let doc = null;
    let source = null;

    if (endpoint === STOCK_PATH) {
      ({ doc, source } = await stockHandler(guid));
    } else if (pathMap[endpoint]) {
      doc = readFileSource(endpoint, guid);
      source = doc ? 'file' : null;
      if (!doc) {
        doc = await readMongoSource(endpoint, guid);
        source = doc ? 'mongo' : null;
      }
    } else {
      log.write({ path: endpoint, guid, status: 400, source: 'unknown-path' });
      return res.status(400).json({ error: 'unknown path', path: endpoint });
    }

    if (!doc) {
      log.write({ path: endpoint, guid, status: 404, source: 'miss' });
      return res.status(404).json({ error: 'not found', path: endpoint, guid });
    }

    const clean = cleanDoc(doc);
    log.write({ path: endpoint, guid, status: 200, source });
    return res.json(clean);
  } catch (err) {
    console.error(`mock-1c error ${endpoint}/${guid}:`, err);
    log.write({ path: endpoint, guid, status: 500, source: 'error' });
    return res.status(500).json({ error: err.message });
  }
});

app.get('/__health', async (req, res) => {
  let mongo = 'disabled';
  if (MONGO_URI) {
    try {
      await mongoDb.command({ ping: 1 });
      mongo = 'ok';
    } catch (err) {
      mongo = `error: ${err.message}`;
    }
  }
  res.json({
    status: 'ok',
    mongo,
    filesDir: FILES_DIR,
    filesDirExists: fs.existsSync(FILES_DIR),
    stockStorageGuid,
    logFile: log.file,
  });
});

app.get('/__served', (req, res) => {
  res.json(log.readSince(req.query.since || null));
});

app.listen(PORT, BIND, () => console.log(`mock-1c listening on ${BIND}:${PORT}`));
