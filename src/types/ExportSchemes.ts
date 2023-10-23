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
    idField: 'res_id',
    procFn: null,
  };
  
export const ZakazClienta: ObjectSchemType = {
  schemeName: 'Заказ клиента',
  collectionName: 'C1_ZC',
  queryField: 'response.ЗаказПокупателя.GUIDЗаказаПокупателя',
  servC1Path: 'get_order',
  exportProcName: 'C1_ZAKAZ_H_I',
  objectPath: 'response.ЗаказПокупателя',
  prmMap: {
    NUM: createPrm({ fName: 'НомерЗаказаПокупателя'}),
    DATA_Z: createPrm({ fName: 'ДатаЗаказаПокупателя'}),
    SROK_Z: createPrm({ fName: 'ДатаОтгрузкиЗаказаПокупателя'}),
    FIRM_ID: createPrm({fName: 'КонтрагентЗаказаПокупателя',
                        objScheme: Kontragent,  
                        objUID: 'GUIDКонтрагента'
                       })
  },
  idField: 'res_id',
  procFn: null,
};

