// Транзитивное замыкание связного набора документов по GUID-ссылкам.
// Обходит JSON, собирает значения всех ключей, начинающихся с "GUID" (GUIDКонтрагента,
// GUIDНоменклатуры, GUIDСпецификации, GUIDКдиницыИзмерения — историческая опечатка, и т.д.),
// ищет каждый GUID во всех коллекциях по их queryField и повторяет до неподвижной точки.
import { pathMap } from '../mock-1c/pathMap.js';

export function collectGuids(node, acc = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) collectGuids(item, acc);
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('GUID') && typeof value === 'string' && value.length >= 32) acc.add(value);
      else collectGuids(value, acc);
    }
  }
  return acc;
}

// db — mongo Db с коллекциями журнала. Возвращает { docs: Map<collection, doc[]>, unresolved: string[] }
export async function buildClosure(db, startCollection, startQueryField, startGuid) {
  const collections = Object.values(pathMap).map((m) => ({ ...m }));
  const seen = new Set();
  const docsByCollection = new Map();
  const unresolved = [];
  let frontier = [];

  const start = await db.collection(startCollection).findOne({ [startQueryField]: startGuid });
  if (!start) return { docs: docsByCollection, unresolved: [startGuid] };
  addDoc(startCollection, start);

  function addDoc(collection, doc) {
    if (!docsByCollection.has(collection)) docsByCollection.set(collection, []);
    docsByCollection.get(collection).push(doc);
    frontier.push(doc);
  }

  seen.add(startGuid);

  while (frontier.length > 0) {
    const batch = frontier;
    frontier = [];
    const guids = new Set();
    for (const doc of batch) collectGuids(doc, guids);

    for (const guid of guids) {
      if (seen.has(guid)) continue;
      seen.add(guid);
      let found = false;
      for (const { collection, queryField } of collections) {
        const doc = await db.collection(collection).findOne({ [queryField]: guid });
        if (doc) {
          addDoc(collection, doc);
          found = true;
          break;
        }
      }
      if (!found) unresolved.push(guid);
    }
  }
  return { docs: docsByCollection, unresolved };
}
