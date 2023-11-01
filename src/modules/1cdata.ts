import axios from 'axios';
import { GetCollectionDriver } from '../controllers/c1_zc.route.js';
import { FindResType, GetObjectType, ObjectSchemType, prmSQLType, createGetObjectType } from '../types/C1Types.js';
import { db_query, getPrmSQLType } from './fbquery.js';
import { getValueByPath } from './objHelper.js';

import * as dotenv from 'dotenv';

dotenv.config();

const C1_WEBSERVER = process.env.C1_WEBSERVER;

async function execObjQuery(
  exportProcName: string,
  prmSQLiu: prmSQLType,
  resFieldName: string,
  strResFieldName: string,
) {
  console.log(`exec ${exportProcName}`);
  const result = { ref_id: null, err: {} };
  if (exportProcName) {
    const resExp = await db_query(exportProcName, 'READ_WRITE', prmSQLiu);
    result.ref_id = resExp[0][resFieldName];
    if (result.ref_id === -1) {
      result.err = { errDescription: resExp[0][strResFieldName] };
    }
  }
  return result;
}

export async function getObjectC1(scheme: ObjectSchemType, uid: string, inObj?: any): Promise<GetObjectType> {
  console.log(`${scheme.schemeName} uid: ${uid}`);
  const result: GetObjectType = createGetObjectType({
    Collection: scheme.collectionName,
    uid: uid,
  });

  //объект для работы с соответствующей колекцией
  const Doc = await GetCollectionDriver(scheme.collectionName, scheme.queryField);
  let DoсRes: FindResType;
  //проверим. возможно уже экспортировался. ####
  if (Doc != null) {
    DoсRes = await Doc.findOne(uid);
    if (DoсRes._id != null) {
      (result._id = DoсRes._id), (result.finding = true);
    }
    //уже есть связанный документ возвращаем результат.
    if (DoсRes.ref_id != null) {
      result.ref_id = DoсRes.ref_id;
    }
    console.log(`${scheme.schemeName} find in mongo id: ${result._id}`);
  }
  if (result.ref_id)
       return result;

  //получаем объект из 1С
  try {
    let obj;
    if (uid) {
      const res = await axios.get(`http://${C1_WEBSERVER}/unf/hs/ht/${scheme.servC1Path}/${uid}`);
      console.log(`axios.get: ${scheme.servC1Path}`);
      obj = res.data;
    }  
    else {
      obj = inObj; 
      console.log('nested object');
    }  
    // проходим по полям scheme.prmMap и создаем объект для выполнения SQL запроса к ERP базе данных
    // параметры для sql запроса.
    result.prmSQLiu = await getPrmSQLType(scheme.prmMap, getValueByPath(obj, scheme.objectPath));
    console.log(`${scheme.schemeName} prmSQLiu: ${result.prmSQLiu}`);
    //добавляем документв в базу данных ERP
    ({ ref_id: result.ref_id, err: result.err } = await execObjQuery(
      scheme.exportProcName,
      result.prmSQLiu,
      scheme.idField,
      scheme.StrResField,
    ));
    if (result.ref_id === null){
      result.err = { errCode: 10,  errDescription: 'ошибка добавление записи в базу ERP' };
      return result;
    }
    //console.log(`${scheme.collectionName} result end:`, result);
    //все вложенные записи типа массив также добавляем в базу данных ERP
    if (scheme.arrMap) {
      for (const key in scheme.arrMap) {
        if (scheme.arrMap[key].fName != null) {
          const arrName = scheme.objectPath  + '.' + scheme.arrMap[key].fName;
          if (arrName != null) {
            const arrayItems:any[] = getValueByPath(obj, arrName);
            for (const elem of arrayItems) {
             // для каждого вложенного элемента
                elem["PARENT_ID"] = result.ref_id;
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore: Object is possibly 'null'.
                const prevResult = await getObjectC1(scheme.arrMap[key].objScheme, null, elem);
                if (prevResult.err && prevResult.err.errCode && prevResult.err.errCode != null){
                  result.err = prevResult.err;
                  return result;
                }                
            }  
          }
        }     
      }   
    }
    //добавляем или заменяем в колекцию монго с уже вставленным в базу ERP документом добавив его id в ref_id
    if (Doc != null) {
      if (!result.finding && result.ref_id != null) {
        const isertRes: any = await Doc.insertOne(obj, result.ref_id);
        if (!isertRes.acknowledged) {
          // не удалось вставить запись в лог монго.
          result.err = { errCode: 20, errDescription: 'ошибка вставки в MongoDB' };
        } else {
          result.inserting = true;
        }
      } else  if (result.finding && result.ref_id != null) {
        // делаем апдейт данных.. скорей всего только ref_id?
        result.err = { errCode: 30,  errDescription: 'ошибка обновления в MongoDB' };
      }
    }
  } catch (err) {
    result.err ={ errCode: 40,  errDescription: 'Исключение', catchErr: err };
  }
  return result;
}
