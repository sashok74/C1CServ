// Карта путей веб-сервиса 1С → коллекция c1_mock + путь до GUID в сохранённом документе.
// Источник истины — src/types/ExportSchemes.ts (servC1Path / collectionName / queryField).
export const pathMap = {
  get_order: { collection: 'C1_ZC', queryField: 'response.ЗаказПокупателя.GUIDЗаказаПокупателя' },
  get_partner: { collection: 'C1_Partner', queryField: 'response.Контрагент.GUIDКонтрагента' },
  get_nomenclature: { collection: 'C1_Nom', queryField: 'response.Номенклатура.GUIDНоменклатуры' },
  get_specification: { collection: 'C1_Bom', queryField: 'response.Спецификация.GUIDСпецификации' },
  // историческая опечатка GUIDEдиницыИзмерения сохранена как в проде
  get_measure: { collection: 'C1_Measure', queryField: 'response.ЕдиницаИзмерения.GUIDEдиницыИзмерения' },
  get_city: { collection: 'C1_City', queryField: 'response.Город.GUIDГорода' },
  get_country: { collection: 'C1_Country', queryField: 'response.Страна.GUIDСтраны' },
  get_organizational_unit: {
    collection: 'C1_Storage',
    queryField: 'response.СтруктурноеПодразделение.GUIDСтруктурнойЕдиницы',
  },
  get_nomenclature_group: {
    collection: 'C1_Catalog',
    queryField: 'response.ГруппаНоменклатуры.GUIDГруппыНоменклатуры',
  },
  // get_quantity_nomenclature в журнал не пишется — обрабатывается синтезом (stock.js)
};

export const STOCK_PATH = 'get_quantity_nomenclature';
