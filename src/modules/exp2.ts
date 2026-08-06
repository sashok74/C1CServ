// Выгрузка данных HiTek в сторону 1С:Бухгалтерии (этап 2).
// Спецификация: c1serv_doc/EXP2_1C_BUH.md, разделы 9-10.
//
// Читает только через fb-port (селект-процедуры EXP2_*_S), ничего не пишет.
// Процедуры отдают плоские денормализованные строки — группировка в документы
// делается здесь. Имена полей в ответе русские, в стиле существующего обмена.
//
// Инкремент: клиент передаёт ?cursor=<последний обработанный ID>, сервис
// возвращает Курсор (максимальный ID пакета) и признак ЕстьЕще.
// ВАЖНО: fb-port превращает 0 и '' в NULL, а NULL в процедурах = «с начала»,
// поэтому cursor=0 и отсутствие курсора означают одно и то же.
import { Request, Response, Router } from 'express';
import { db_query } from './fbquery.js';

type Row = { [key: string]: any };

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function parseCursor(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

// Единый конверт ответа для 1С.
function packet(entity: string, items: unknown[], cursor: number | null, hasMore: boolean) {
  return {
    response: {
      ПакетВыгрузки: {
        Сущность: entity,
        Курсор: cursor,
        ЕстьЕще: hasMore,
        Количество: items.length,
        Элементы: items,
      },
    },
  };
}

async function callProc(proc: string, prm: object): Promise<Row[]> {
  const data = await db_query(proc, 'READ_ONLY', prm);
  return Array.isArray(data) ? (data as Row[]) : [];
}

function номенклатураИз(r: Row, prefix = '') {
  return {
    ИдHiTek: r[`${prefix}NOM_ID`],
    КодНоменклатуры: r[`${prefix}KOD_IZD`] ?? null,
    Наименование: r[`${prefix}NOM_NAME`] ?? null,
    ЕдиницаИзмерения: r[`${prefix}MSR_NAME`] ?? null,
    ТребуетРучногоРазбора: (r[`${prefix}KOD_CNT`] ?? 0) > 1 || !r[`${prefix}KOD_IZD`],
  };
}

const routes = Router();

// --- Справочник: номенклатура и её код 1С -----------------------------------
routes.get('/exp2/v1/nomenclature', async (req: Request, res: Response) => {
  try {
    const limit = parseLimit(req.query.limit);
    const cursor = parseCursor(req.query.cursor);
    const rows = await callProc('EXP2_NOM_LINK_S', { FROM_NOM_ID_IN: cursor, MAX_ROWS_IN: limit });
    const items = rows.map((r) => ({
      ИдHiTek: r.NOM_ID,
      КодНоменклатуры: r.KOD_IZD ?? null,
      Артикул: r.ART_IZD ?? null,
      Наименование: r.NOM_NAME ?? null,
      Обозначение: r.NOM_SHEET ?? null,
      ЕдиницаИзмерения: r.MSR_NAME ?? null,
      КодЕдиницыHiTek: r.MSR_CODE ?? null,
      Группа: r.CATALOG_NAME ?? null,
      КореньКаталога: r.ROOT_CATALOG_NAME ?? null,
      ЕстьСпецификация: r.HAS_BOM === 1,
      ВходитВСпецификации: r.USED_IN_BOM === 1,
      ТребуетРучногоРазбора: (r.KOD_CNT ?? 0) > 1 || !r.KOD_IZD,
    }));
    const cur = items.length ? Number(items[items.length - 1].ИдHiTek) : cursor;
    res.json(packet('Номенклатура', items, cur, items.length === limit));
  } catch (err: any) {
    res.status(502).json({ error: 'Ошибка выгрузки номенклатуры', detail: err.message });
  }
});

// --- Справочник: складские единицы (с мерой «живости») -----------------------
routes.get('/exp2/v1/storages', async (req: Request, res: Response) => {
  try {
    const rows = await callProc('EXP2_STORAGE_S', {});
    const items = rows.map((r) => ({
      ИдHiTek: r.STR_ID,
      Наименование: r.NAME ?? null,
      ДвиженийВсего: r.MOVES_CNT ?? 0,
      НоменклатурныхПозиций: r.NOM_CNT ?? 0,
      ПоследнееДвижение: r.LAST_MOVE ?? null,
    }));
    res.json(packet('СкладскиеЕдиницы', items, null, false));
  } catch (err: any) {
    res.status(502).json({ error: 'Ошибка выгрузки складов', detail: err.message });
  }
});

// --- Спецификации (состав изделий) ------------------------------------------
routes.get('/exp2/v1/specifications', async (req: Request, res: Response) => {
  try {
    const limit = parseLimit(req.query.limit);
    const cursor = parseCursor(req.query.cursor);
    const rows = await callProc('EXP2_BOM_S', { FROM_BOM_ID_IN: cursor, MAX_ROWS_IN: limit });

    const byBom = new Map<number, any>();
    for (const r of rows) {
      const id = Number(r.BOM_LIST_ID);
      if (!byBom.has(id)) {
        byBom.set(id, {
          ИдHiTek: id,
          Наименование: r.BOM_NAME ?? null,
          Продукция: {
            ИдHiTek: r.PROD_NOM_ID,
            КодНоменклатуры: r.PROD_KOD ?? null,
            Наименование: r.PROD_NAME ?? null,
            ЕдиницаИзмерения: r.PROD_MSR ?? null,
          },
          Состав: [],
        });
      }
      byBom.get(id).Состав.push({
        НомерСтроки: r.ITEM_ORD ?? null,
        Номенклатура: {
          ИдHiTek: r.ITEM_NOM_ID,
          КодНоменклатуры: r.ITEM_KOD ?? null,
          Наименование: r.ITEM_NAME ?? null,
          ЕдиницаИзмерения: r.ITEM_MSR ?? null,
          ТребуетРучногоРазбора: (r.ITEM_KOD_CNT ?? 0) > 1 || !r.ITEM_KOD,
        },
        Количество: r.ITEM_CNT ?? 0,
      });
    }
    const items = [...byBom.values()];
    // последняя спецификация может быть обрезана лимитом строк — её не отдаём
    const truncated = rows.length === limit && items.length > 1;
    if (truncated) items.pop();
    const cur = items.length ? Number(items[items.length - 1].ИдHiTek) : cursor;
    res.json(packet('Спецификации', items, cur, rows.length === limit));
  } catch (err: any) {
    res.status(502).json({ error: 'Ошибка выгрузки спецификаций', detail: err.message });
  }
});

// --- Документ: расход материалов в производство (Требование-накладная) -------
routes.get('/exp2/v1/requirements', async (req: Request, res: Response) => {
  try {
    const limit = parseLimit(req.query.limit);
    const cursor = parseCursor(req.query.cursor);
    const rows = await callProc('EXP2_ISSUE_S', { FROM_ID_IN: cursor, MAX_ROWS_IN: limit });

    const byDoc = new Map<number, any>();
    let maxTrans = cursor ?? 0;
    for (const r of rows) {
      maxTrans = Math.max(maxTrans, Number(r.TRANS_ID));
      const id = Number(r.DOC_ID);
      if (!byDoc.has(id)) {
        byDoc.set(id, {
          ИдHiTek: id,
          НомерДокумента: r.DOC_NUMBER ?? null,
          ДатаДокумента: r.DATE_DOC ?? null,
          Комментарий: r.DOC_DESCRIPT ?? null,
          Проведен: r.REGISTED ?? 0,
          Склад: { ИдHiTek: r.STORAGE_ID, Наименование: r.STORAGE_NAME ?? null },
          // изделие запуска -> субконто «Продукция» на счёте 20.01
          Продукция: {
            ИдHiTek: r.PROD_NOM_ID,
            КодНоменклатуры: r.PROD_KOD ?? null,
            Наименование: r.PROD_NAME ?? null,
            РазмерЗапуска: r.PROD_CNT ?? null,
            ТребуетРучногоРазбора: (r.PROD_KOD_CNT ?? 0) > 1 || !r.PROD_KOD,
          },
          Строки: [],
        });
      }
      byDoc.get(id).Строки.push({
        ИдДвижения: r.TRANS_ID,
        Номенклатура: номенклатураИз(r),
        Количество: r.CNT ?? 0,
        ДатаДвижения: r.DATE_TRANS ?? null,
        ИдПартии: r.PACK_ID ?? null,
      });
    }
    const items = [...byDoc.values()];
    res.json(packet('ТребованиеНакладная', items, rows.length ? maxTrans : cursor, rows.length === limit));
  } catch (err: any) {
    res.status(502).json({ error: 'Ошибка выгрузки расхода в производство', detail: err.message });
  }
});

// --- Документ: перемещение между складами ------------------------------------
routes.get('/exp2/v1/transfers', async (req: Request, res: Response) => {
  try {
    const limit = parseLimit(req.query.limit);
    const cursor = parseCursor(req.query.cursor);
    const rows = await callProc('EXP2_TRANSFER_S', { FROM_ID_IN: cursor, MAX_ROWS_IN: limit });

    const byDoc = new Map<number, any>();
    let maxTrans = cursor ?? 0;
    for (const r of rows) {
      maxTrans = Math.max(maxTrans, Number(r.TRANS_ID));
      const id = Number(r.DOC_ID);
      if (!byDoc.has(id)) {
        byDoc.set(id, {
          ИдHiTek: id,
          НомерДокумента: r.DOC_NUMBER ?? null,
          ДатаДокумента: r.DATE_DOC ?? null,
          Комментарий: r.DOC_DESCRIPT ?? null,
          Проведен: r.REGISTED ?? 0,
          СкладОтправитель: { ИдHiTek: r.STORAGE_OUT_ID, Наименование: r.STORAGE_OUT_NAME ?? null },
          СкладПолучатель: { ИдHiTek: r.STORAGE_IN_ID, Наименование: r.STORAGE_IN_NAME ?? null },
          Строки: [],
        });
      }
      byDoc.get(id).Строки.push({
        ИдДвижения: r.TRANS_ID,
        ИдДвиженияРасход: r.TRANS_ID_OUT ?? null,
        ИдДвиженияПриход: r.TRANS_ID_IN ?? null,
        Номенклатура: номенклатураИз(r),
        Количество: r.CNT ?? 0,
        ДатаДвижения: r.DATE_TRANS ?? null,
        ИдПартии: r.PACK_ID ?? null,
      });
    }
    const items = [...byDoc.values()];
    res.json(packet('ПеремещениеТоваров', items, rows.length ? maxTrans : cursor, rows.length === limit));
  } catch (err: any) {
    res.status(502).json({ error: 'Ошибка выгрузки перемещений', detail: err.message });
  }
});

// --- Диагностика: что вообще доступно и живо ---------------------------------
routes.get('/exp2/v1/state', async (req: Request, res: Response) => {
  const probe = async (proc: string, prm: object) => {
    try {
      const rows = await callProc(proc, prm);
      return { доступна: true, строкПробно: rows.length };
    } catch (err: any) {
      return { доступна: false, ошибка: err.message };
    }
  };
  res.json({
    response: {
      Состояние: {
        Номенклатура: await probe('EXP2_NOM_LINK_S', { FROM_NOM_ID_IN: null, MAX_ROWS_IN: 1 }),
        Спецификации: await probe('EXP2_BOM_S', { FROM_BOM_ID_IN: null, MAX_ROWS_IN: 1 }),
        ТребованиеНакладная: await probe('EXP2_ISSUE_S', { FROM_ID_IN: null, MAX_ROWS_IN: 1 }),
        ПеремещениеТоваров: await probe('EXP2_TRANSFER_S', { FROM_ID_IN: null, MAX_ROWS_IN: 1 }),
        Подсказка: 'Инкремент: передавайте ?cursor=<последний обработанный ИдДвижения/ИдHiTek>',
      },
    },
  });
});

export default routes;
