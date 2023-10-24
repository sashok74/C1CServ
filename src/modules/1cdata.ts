import axios from 'axios';
import { GetCollectionDriver } from '../controllers/c1_zc.route.js';
import { FindResType, GetObjectType, ObjectSchemType, prmSQLType } from '../types/C1Types.js';
//import { getOrderResponse } from '../testData/res.getDoc.js'
import * as dotenv from 'dotenv';
dotenv.config();

const C1_WEBSERVER = process.env.C1_WEBSERVER;

function getValueByPath(obj: any, path: string) {
  return path.split('.').reduce((o, k) => (o || {})[k], obj);
}

export async function getObjectC1(scheme: ObjectSchemType, uid: string): Promise<GetObjectType> {
  const result: GetObjectType = {
    Collection: scheme.collectionName,
    uid: uid,
    _id: null,
    ref_id: null,
    inserting: false,
    finding: false,
    prmSQLiu: {},
    err: null,
  };
    if (!uid) {
    return result;
  }
  console.log(`${scheme.collectionName} uid:`, uid);
  //объект для работы с соответствующей колекцией
  const Doc = await GetCollectionDriver(scheme.collectionName, scheme.queryField);
  //проверим. возможно уже экспортировался.
  const DoRes: FindResType = await Doc.findOne(uid);
  if (DoRes._id != null) {
    result._id = DoRes._id,
    result.finding = true
  }
  //уже есть связанный документ возвращаем результат.
  if (DoRes.ref_id != null) {
    result.ref_id = DoRes.ref_id;
  }

  //получаем объект из 1С
  try {
    const res = await axios.get(`http://${C1_WEBSERVER}/unf/hs/ht/${scheme.servC1Path}/${uid}`);

    // проходим по полям scheme.prmMap и создаем объект для выполнения SQL запроса к ERP базе данных

    const inPrm: prmSQLType = {};

    for (const key in scheme.prmMap) {
      if (scheme.prmMap[key].fName && scheme.prmMap[key].isArray === false) {
        const path:string = scheme.objectPath + '.' + scheme.prmMap[key].fName;
        let value = getValueByPath(res.data,path);
        if (
          scheme.prmMap[key].len > 0 &&
          scheme.prmMap[key].type === 'VARCHAR' &&
          scheme.prmMap[key].objScheme === null
        ) {
          value = value.substring(0, scheme.prmMap[key].len);
        } else if (scheme.prmMap[key].objScheme != null) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore: Object is possibly 'null'.
          const uid = getValueByPath(value, scheme.prmMap[key].objUID);
          console.log('getObjectC1 uid:', value, uid);

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore: Object is possibly 'null'.
          value = await getObjectC1(scheme.prmMap[key].objScheme, uid);
        }
        inPrm[key] = value;
      }
    }
    result.prmSQLiu = inPrm; 
    console.log('inPrm:', inPrm);

    //добавляем документв в базу данных ERP

    //все вложенные записи типа массив также добавляем в базу данных ERP

    //добавляем или заменяем в колекцию монго с уже вставленным в базу ERP документом добавив его id в ref_id
    if (!result.finding) {
      const isertRes: any = await Doc.insertOne(res.data, result.ref_id);
      if (!isertRes.acknowledged) {
        // не удалось вставить запись в лог монго.
        result.err = { errDescription: 'ошибка вставки в MongoDB' };
      }
    }else{

    }
  } catch (err) {
    result.err = err;
  }
  return result;
}
