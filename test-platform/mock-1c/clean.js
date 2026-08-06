// Сохранённые в журнале ответы 1С «загрязнены» полями, которые дописал сам C1CServ
// (см. src/modules/1cdata.ts): GUID на верхнем уровне; GUID, SYNC_ID, ADD внутри objectPath;
// PARENT_ID в элементах вложенных массивов. Плюс служебные поля Mongo: _id, res.
// Оригинальные ответы 1С ключей с такими именами не содержат (легитимные ключи —
// GUIDНоменклатуры, GUIDКонтрагента и т.п. — не затрагиваются: сравнение строгое, по полному имени).
const INJECTED_KEYS = new Set(['GUID', 'SYNC_ID', 'ADD', 'PARENT_ID']);

function stripInjected(node) {
  if (Array.isArray(node)) {
    for (const item of node) stripInjected(item);
    return node;
  }
  if (node !== null && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      if (INJECTED_KEYS.has(key)) delete node[key];
      else stripInjected(node[key]);
    }
  }
  return node;
}

// doc — документ из журнала (или файл); возвращает очищенную копию.
export function cleanDoc(doc) {
  const copy = JSON.parse(JSON.stringify(doc));
  delete copy._id;
  delete copy.res;
  return stripInjected(copy);
}
