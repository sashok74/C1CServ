import { ObjProcessFunc, ObjectSchemType } from './C1Types.js';

// prmMap соответсвеие параметров процедуры для экспорта и 
// поелй объекта и которого эти данные берем
// получить параметры процедуры можно из функции MET$PROC_IN_PARAM_INFO_S

export const ZakazClienta: ObjectSchemType = {
  schemeName: 'Заказ клиента',
  collectionName: 'C1_ZC',
  queryField: 'response.ЗаказПокупателя.GUIDЗаказаПокупателя',
  servC1Path: 'get_order',
  exportProcName: 'c1_zakaz_h_i',
  prmMap: {
    NUM: '',
    DATA_Z: '',
    SROK_Z: '',
    KOD_ZAK: '',
    NAME_ZAK: '',
    NUM_ZAIY: '',
    DATA_ZAIY: '',
  },
  idField: 'res_id',
  procFn: null,
};

export const Kontragent: ObjectSchemType = {
    schemeName: 'Контрагент',
    collectionName: 'C1_Partner',
    queryField: 'response.Контрагент.GUIDКонтрагента',
    servC1Path: 'get_partner',
    exportProcName: 'c1_zakaz_h_i',
    prmMap: {
      NUM: '',
      DATA_Z: '',
      SROK_Z: '',
      KOD_ZAK: '',
      NAME_ZAK: '',
      NUM_ZAIY: '',
      DATA_ZAIY: '',
    },
    idField: 'res_id',
    procFn: null,
  };