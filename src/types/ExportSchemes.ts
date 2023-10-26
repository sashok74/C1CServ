import { ObjProcessFunc, ObjectSchemType, createPrm } from './C1Types.js';

// prmMap соответсвеие параметров процедуры для экспорта и
// поелй объекта и которого эти данные берем
// получить параметры процедуры можно из функции MET$PROC_IN_PARAM_INFO_S

export const Kontragent: ObjectSchemType = {
  schemeName: 'Контрагент',
  collectionName: 'C1_Partner',
  queryField: 'response.Контрагент.GUIDКонтрагента',
  servC1Path: 'get_partner',
  exportProcName: 'STR_FIRM_IU',
  objectPath: 'response.Контрагент',
  prmMap: {
    STR_ID: createPrm({ fName: '' }),
    NAME: createPrm({ fName: 'НаименованиеКонтрагента', len: 50 }),
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR',
  procFn: null,
};

//SELECT RES_ID, RES_STR from EXP_CATALOG_IU(:ID, :PID, :CATALOG_NAME, :KEYW)
//let Catalog: ObjectSchemType;

let catalog: ObjectSchemType;

// из-за рекурссии использования catalog.prmMap.PID.objScheme 
// оформим в виде функции.

function getCatalog(): ObjectSchemType {
  if (!catalog) {
    catalog = {
      schemeName: 'Каталог номенклатуры',
      collectionName: 'C1_Catalog',
      queryField: 'response.ГруппаНоменклатуры.GUIDГруппыНоменклатуры',
      servC1Path: 'nomenclaturecategories',
      exportProcName: 'EXP_CATALOG_IU',
      objectPath: 'response.ГруппаНоменклатуры',
      prmMap: {
        ID: createPrm({}), // null
        PID: createPrm({ fName: 'РодительГруппыНоменклатуры', objUID: 'GUIDРодителяГруппыНоменклатуры' }),
        CATALOG_NAME: createPrm({ fName: 'НаименованиеГруппыНоменклатуры', len: 100 }),
        KEYW: createPrm({ fName: '', len: 4 }),
      },
      idField: 'RES_ID',
      StrResField: 'RES_STR',
      procFn: null,
    };

    catalog.prmMap.PID.objScheme = catalog;
  }

  return catalog;
}
export const Catalog = getCatalog();

export const ZakazClienta: ObjectSchemType = {
  schemeName: 'Заказ клиента',
  collectionName: 'C1_ZC',
  queryField: 'response.ЗаказПокупателя.GUIDЗаказаПокупателя',
  servC1Path: 'get_order',
  exportProcName: 'C1_ZAKAZ_H_I',
  objectPath: 'response.ЗаказПокупателя',
  prmMap: {
    NUM: createPrm({ fName: 'НомерЗаказаПокупателя' }),
    DATA_Z: createPrm({ fName: 'ДатаЗаказаПокупателя' }),
    SROK_Z: createPrm({ fName: 'ДатаОтгрузкиЗаказаПокупателя' }),
    FIRM_ID: createPrm({ fName: 'КонтрагентЗаказаПокупателя', objScheme: Kontragent, objUID: 'GUIDКонтрагента' }),
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR',
  procFn: null,
};
