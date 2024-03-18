import { getItemGUID, getObjectC1 } from './1cdata.js'
import { Kontragent, Catalog, City, Country, Measure, Storage, Nom, BH_NomUpdate, objectInfoMap} from '../types/ExportSchemes.js';
import { getValueByPath } from './objHelper.js';
import { db_query, getPrmSQLType } from './fbquery.js';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { parse, join } from 'path';
import Response from 'express';

dotenv.config();

const C1_WEBSERVER = process.env.C1_WEBSERVER;

export type NewObjType = { ref_id: number, guid: string|null, response: object, request: object, result_new: object, result_get: object };

export async function erpNewNom(id: number): Promise<NewObjType> {
    const result: NewObjType = {ref_id: id, guid: null, response: {}, request: {}, result_new: {}, result_get: {}};
    
    // проверяем. нет ли в логе соответствия. если есть то возвращаем GUID
    // Есле нет то из базы erp достаем данные по номенклатуре
    // отдаем на сервер 1C и получаем в ответе новый GUID, kod_izd art_izd
    // сделать проверку  того что записалось в 1С, с помощью запроса новой номенклатуры.   
    // записываем данные о соовтетствии в MONGO
    // записать данные о номенклатуре 1С в ERP
    
    // проверяем. нет ли в логе соответствия. если есть то возвращаем GUID
    let guid = null;
    const objectName = 'Nom';
    const objectInfo = objectInfoMap.get(objectName);

    if (objectInfo) {
      const { collectionName, queryField } = objectInfo;
      const itemRes = await getItemGUID(collectionName, id);
      guid = null;
  
      if (itemRes) {
        guid = getValueByPath(itemRes, queryField) as string;
      }
    }
    result.guid = guid;
    if (guid != null) {
       return result;
    }
    // Есле нет то из базы erp достаем данные по номенклатуре
    // делаем запрос напрямую к базе данных. 
    // тоже самое можно сделать через сервис который работает с базой.
    const nom_object = await db_query('EXP_NOM_S', 'READ_WRITE', {NOM_ID_IN: id});
    result.response = nom_object[0];

    //если получили данные в nom_object
    //делаем запрос на сервер с1 для создания новой номенклатуры:
    /*
        {
    	   "НаименованиеНоменклатуры": "Новая номенклатура - 12345",
	       "GUIDКдиницыИзмерения": "880e9560-70ae-11e5-a27e-74d435043ca5",
	       "GUIDГруппыНоменклатуры": "bb1a0c53-4e4b-11ea-b97e-f0795970fef5"
        }
    */

    const cat =  await erpNewCatalog(nom_object[0].CATALOG_ID);   
    const measure =  await erpNewMeasure(nom_object[0].MEASUER_ID);
    const c_req = {
        НаименованиеНоменклатуры: nom_object[0].NOM_NAME,
        GUIDКдиницыИзмерения: measure.guid,
        GUIDГруппыНоменклатуры: cat.guid
    };
    result.request = c_req;
    
    // отдаем на сервер 1C и получаем в ответе новый GUID, kod_izd art_izd
    const c1_res:any = await axios.post(`http://${C1_WEBSERVER}/bp_ht/hs/ht_bp/nomenclature`,c_req);
    //console.log(c1_res.data);
    //const newGUID = c1_res.data.response.guid;
    result.result_new = c1_res.data;
  
    // сделать проверку  того что записалось в 1С, с помощью запроса новой номенклатуры. 
    const doc_json = await getObjectC1(BH_NomUpdate, c1_res.data.response.guid, id);
    result.result_get = doc_json;
     //result.status(201);
    // записываем данные о соовтетствии в MONGO
    
    // записать данные о номенклатуре 1С в ERP

    return result;
}

export async function erpNewCatalog(id: number): Promise<NewObjType> {
    const result: NewObjType = {ref_id: id, guid: null, response: {}, request: {}, result_new:  {}, result_get: {}};
    // проверяем. нет ли в логе соответствия. если есть то возвращаем GUID
    let guid = null;
    const objectName = 'Catalog';
    const objectInfo = objectInfoMap.get(objectName);

    if (objectInfo) {
      const { collectionName, queryField } = objectInfo;
      const itemRes = await getItemGUID(collectionName, id);
      guid = null;
  
      if (itemRes) {
        guid = getValueByPath(itemRes, queryField) as string;
      }
    }
    result.guid = guid;
    if (guid != null) {
       return result;
    }    
    return result;
}

export async function erpNewMeasure(id: number): Promise<NewObjType> {
    const result: NewObjType = {ref_id: id, guid: null, response: {}, request: {}, result_new:  {}, result_get: {}};
    // проверяем. нет ли в логе соответствия. если есть то возвращаем GUID
    let guid = null;
    const objectName = 'Measure';
    const objectInfo = objectInfoMap.get(objectName);

    if (objectInfo) {
      const { collectionName, queryField } = objectInfo;
      const itemRes = await getItemGUID(collectionName, id);
      guid = null;
  
      if (itemRes) {
        guid = getValueByPath(itemRes, queryField) as string;
      }
    }
    result.guid = guid;
    if (guid != null) {
       return result;
    }    
    return result;
}