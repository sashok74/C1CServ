import { ObjectSchemType, createPrm } from './C1Types.js';

// prmMap соответсвеие параметров процедуры для экспорта и
// поелй объекта и которого эти данные берем
// получить параметры процедуры можно из функции MET$PROC_IN_PARAM_INFO_S
// select param_name || ': createPrm({fName: ''''' || iif(pfrom=0 , '', ', len: '|| substring(param_type from pfrom+1 for pto - pfrom - 1 )) ||'}),'
// from (select
//         trim(f.param_name) as param_name,
//         trim(f.param_type)  as param_type,
//          position('(',f.param_type) as pfrom,
//          position(')',f.param_type) as pto
//        from MET$PROC_IN_PARAM_INFO_S(:proc) f)

export const Measure: ObjectSchemType = {
  schemeName: 'Единицы измерения',
  collectionName: 'C1_Measure',
  queryField: 'response.ЕдиницаИзмерения.GUIDEдиницыИзмерения',
  servC1Path: 'get_measure',
  exportProcName: 'EXP_MEASURE_IU',
  objectPath: 'response.ЕдиницаИзмерения',
  prmMap: {
   // ID: createPrm({ fName: '' }),
    MEASURE_NAME: createPrm({ fName: 'СокращениеЕдиницыИзмерения', len: 15 }),
    MEASURE_CODE: createPrm({ fName: 'КодЕдиницыИзмерения', len: 3 }),
    DESCR: createPrm({ fName: 'НаименованиеЕдиницыИзмерения', len: 15 }),
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR'
};

export const City: ObjectSchemType = {
  schemeName: 'Города',
  collectionName: 'C1_City',
  queryField: 'response.Город.GUIDГорода',
  servC1Path: 'get_city',
  exportProcName: 'EXP_CITY_IU',
  objectPath: 'response.Город',
  prmMap: {
    ID: createPrm({}),
    CITY_NAME: createPrm({ fName: 'НаименованиеГорода', len: 50 }),
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR'
};

export const Country: ObjectSchemType = {
  schemeName: 'Страны',
  collectionName: 'C1_Country',
  queryField: 'response.Страна.GUIDСтраны',
  servC1Path: 'get_country',
  exportProcName: 'EXP_COUNTRY_IU',
  objectPath: 'response.Страна',
  prmMap: {
    ID: createPrm({}),
    COUNTRY_NAME: createPrm({ fName: 'НаименованиеСтраны', len: 50 }),
    COUNTRY_COD: createPrm({ fName: 'КодСтраны', len: 3 }),
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR'
};

export const Storage: ObjectSchemType = {
  schemeName: 'Участки',
  collectionName: 'C1_Storage',
  queryField: 'response.СтруктурноеПодразделение.GUIDСтруктурнойЕдиницы',
  servC1Path: 'get_organizational_unit',
  exportProcName: 'EXP_STORAGE_IU',
  objectPath: 'response.СтруктурноеПодразделение',
  prmMap: {
    //ID: createPrm({}),
    STORAGE_NAME: createPrm({ fName: 'НаименованиеСтруктурнойЕдиницы', len: 50 }),
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR'
};

export const Kontragent: ObjectSchemType = {
  schemeName: 'Контрагент',
  collectionName: 'C1_Partner',
  queryField: 'response.Контрагент.GUIDКонтрагента',
  servC1Path: 'get_partner',
  exportProcName: 'EXP_FIRM_IU',
  objectPath: 'response.Контрагент',
  prmMap: {
    //ID: createPrm({ fName: '' }),
    FIRM_NAME: createPrm({ fName: 'НаименованиеКонтрагента', len: 50 }),
    FIRM_CODE: createPrm({ fName: 'КодКонтрагента', len: 9 }),
    //CITY_ID: createPrm({ fName: '' }),
    ADDRESS: createPrm({ fName: 'АдресКонтрагентаПолный', len: 255 }),
    CONTACT_PERSON: createPrm({ fName: 'НаименованиеКонтактногоЛицаКонтрагента', len: 100 }),
    INN: createPrm({ fName: 'ИННКонтрагента', len: 12 }),
    //COUNTRY_ID: createPrm({ fName: '' }),
    KPP: createPrm({ fName: 'КППКонтрагента', len: 9 }),
    OKPO: createPrm({ fName: 'ОКПОКонтрагента', len: 14 }),
    BANK_ACCOUNT: createPrm({ fName: 'НомерБанковсогоСчетаКонтрагента', len: 34 }),
    BANK_ACCOUNT_COUNTRY_COD: createPrm({ fName: 'КодСтраныБанковсогоСчетаКонтрагента', len: 3 }),
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR'
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
      servC1Path: 'get_nomenclature_group',
      exportProcName: 'EXP_CATALOG_IU',
      objectPath: 'response.ГруппаНоменклатуры',
      prmMap: {
        ID: createPrm({}), // null
        PID: createPrm({ fName: 'РодительГруппыНоменклатуры', objUID: 'GUIDРодителяГруппыНоменклатуры' }),
        CATALOG_NAME: createPrm({ fName: 'НаименованиеГруппыНоменклатуры', len: 100 }),
        KEYW: createPrm({ fName: '', len: 4 }),
      },
      idField: 'RES_ID',
      StrResField: 'RES_STR'
    };

    catalog.prmMap.PID.objScheme = catalog;
  }

  return catalog;
}
export const Catalog = getCatalog();

export const Nom: ObjectSchemType = {
  schemeName: 'Номенклатура',
  collectionName: 'C1_Nom',
  queryField: 'response.Номенклатура.GUIDНоменклатуры',
  servC1Path: 'get_nomenclature',
  exportProcName: 'EXP_NOM_IU',
  objectPath: 'response.Номенклатура',
  prmMap: {
    //ID: createPrm({fName: ''}),
    NAME_IZD: createPrm({fName: 'НаименованиеНоменклатуры', len: 150}),
    KOD_IZD: createPrm({fName: 'КодНоменклатуры', len: 10}),
    ART_IZD: createPrm({fName: 'АртикулНоменклатуры', len: 15}),
    MEASURE_ID: createPrm({fName: 'ЕдиницаИзмеренияНоменклатуры', objScheme: Measure, objUID: 'GUIDКдиницыИзмерения'}),
    CATALOG_ID: createPrm({fName: 'ГруппаНоменклатуры', objScheme: Catalog, objUID: 'GUIDГруппыНоменклатуры'}),
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR'
};

export const ZakazClientaItem: ObjectSchemType = {
  schemeName: 'Заказ клиента, строки',
  collectionName: '',
  queryField: '',
  servC1Path: '',
  exportProcName: 'EXP_ZAKAZ_ITEMS_IU',
  objectPath: '',
  prmMap: {
    ID_ZAKAZ: createPrm({fName: 'PARENT_ID'}),
    NOM_ID: createPrm({fName: 'Номенклатура', objScheme: Nom, objUID: 'GUIDНоменклатуры' }),
    MEASURE_ID: createPrm({fName: 'ЕдиницаИзмеренияНоменклатуры', objScheme: Measure, objUID: 'GUIDКдиницыИзмерения' }),
    CNT: createPrm({fName: 'КоличествоНоменклатуры'})
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR'
};

export const ZakazClienta: ObjectSchemType = {
  schemeName: 'Заказ клиента',
  collectionName: 'C1_ZC',
  queryField: 'response.ЗаказПокупателя.GUIDЗаказаПокупателя',
  servC1Path: 'get_order',
  exportProcName: 'EXP_ZAKAZ_IU',
  objectPath: 'response.ЗаказПокупателя',
  prmMap: {
    NUM_Z: createPrm({ fName: 'НомерЗаказаПокупателя' }),
    DATA_Z: createPrm({ fName: 'ДатаЗаказаПокупателя' }),
    SROK_Z: createPrm({ fName: 'ДатаОтгрузкиЗаказаПокупателя' }),
    FIRM_ID: createPrm({ fName: 'КонтрагентЗаказаПокупателя', objScheme: Kontragent, objUID: 'GUIDКонтрагента' }),
  },
  arrMap: {
    DOC_ITEMS: createPrm({ fName: 'НоменклатураЗаказаПокупателя', objScheme: ZakazClientaItem}),
  },
  idField: 'RES_ID',
  StrResField: 'RES_STR'
};


