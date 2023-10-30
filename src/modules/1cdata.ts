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
  if (!uid) {
    return result;
  }
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
  }

  //получаем объект из 1С
  try {
    const res = await axios.get(`http://${C1_WEBSERVER}/unf/hs/ht/${scheme.servC1Path}/${uid}`);
    // проходим по полям scheme.prmMap и создаем объект для выполнения SQL запроса к ERP базе данных
    // параметры для sql запроса.
    result.prmSQLiu = await getPrmSQLType(scheme.prmMap, getValueByPath(res.data, scheme.objectPath));
    console.log(`${scheme.schemeName} prmSQLiu: ${result.prmSQLiu}`);
    //добавляем документв в базу данных ERP
    ({ ref_id: result.ref_id, err: result.err } = await execObjQuery(
      scheme.exportProcName,
      result.prmSQLiu,
      scheme.idField,
      scheme.StrResField,
    ));
    //console.log(`${scheme.collectionName} result end:`, result);
    //все вложенные записи типа массив также добавляем в базу данных ERP

    //добавляем или заменяем в колекцию монго с уже вставленным в базу ERP документом добавив его id в ref_id
    if (Doc != null) {
      if (!result.finding) {
        const isertRes: any = await Doc.insertOne(res.data, result.ref_id);
        if (!isertRes.acknowledged) {
          // не удалось вставить запись в лог монго.
          result.err = { errDescription: 'ошибка вставки в MongoDB' };
        } else {
          result.inserting = true;
        }
      } else {
        // делаем апдейт данных.. скорей всего только ref_id?
        result.err = { errDescription: 'ошибка обновления в MongoDB' };
      }
    }
  } catch (err) {
    result.err = err;
  }
  return result;
}
