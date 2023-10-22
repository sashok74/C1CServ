import axios from 'axios';
import { insertC1_Parner, GetCollectionDriver } from '../controllers/c1_zc.route.js';
import { FindResType, GetObjectType } from '../types/C1Types.js';
//import { getOrderResponse } from '../testData/res.getDoc.js'
import * as dotenv from 'dotenv';
dotenv.config();

const C1_WEBSERVER = process.env.C1_WEBSERVER;

export async function getDoc(uid: string): Promise<GetObjectType> {
  const result: GetObjectType = {
    Collection: 'C1_ZC',
    uid: uid,
    ref_id: null,
    inserting: false,
    finding: false,
    err: null,
  };
  console.log('getDoc uid:', uid);
  //объект для работы с соответствующей колекцией
  const Doc = await GetCollectionDriver('C1_ZC', 'response.ЗаказПокупателя.GUIDЗаказаПокупателя');
  //проверим. возможно уже экспортировался.
  const DoRes: FindResType = await Doc.findOne(uid);
  if (DoRes.ref_id != null) {
    result.ref_id = DoRes.ref_id;
    result.finding = true;
    return result;
  }
  //получаем объект из 1С
  try {
    const res = await axios.get(`http://${C1_WEBSERVER}/unf/hs/ht/get_order/${uid}`);

    //сперва проверим все вложеные объекты
    //контрагент.
    const parterRes:GetObjectType =await getPartner(res.data.response.ЗаказПокупателя.КонтрагентЗаказаПокупателя.GUIDКонтрагента);
    if (parterRes.err === null){
       console.log('контрагент результат:', parterRes); 
    }
    //добавляем документв в базу данных ERP

    //все вложенные записи типа массив также добавляем в базу данных ERP

    //добавляем в колекцию монго с уже вставленным в базу ERP документом добавив его id в ref_id
    const isertRes: any = await Doc.insertOne(res.data, result.ref_id);
    if (!isertRes.acknowledged) {
      // не удалось вставить запись в лог монго.
      result.err = { errDescription: 'ошибка вставки в MongoDB' };
    }
  } catch (err) {
    result.err = err;
  }
  return result;
}

export async function getPartner(uid: string): Promise<GetObjectType> {
  const result: GetObjectType = {
    Collection: 'C1_Partner',
    uid: uid,
    ref_id: null,
    inserting: false,
    finding: false,
    err: null,
  };
  console.log('getPartner uid:', uid);
  //объект для работы с соответствующей колекцией
  const Doc = await GetCollectionDriver('C1_Partner', 'response.ЗаказПокупателя.GUIDЗаказаПокупателя');
  //проверим. возможно уже экспортировался.
  const DoRes: FindResType = await Doc.findOne(uid);
  if (DoRes.ref_id != null) {
    result.ref_id = DoRes.ref_id;
    result.finding = true;
    return result;
  }
  //получаем объект из 1С
  try {
    const res = await axios.get(`http://${C1_WEBSERVER}/unf/hs/ht/get_partner/${uid}`);
    //проверка вложенныж
    // .. нет
    //добавляем документв в базу данных ERP

    //все вложенные записи типа массив также добавляем в базу данных ERP

    //добавляем в колекцию монго с уже вставленным в базу ERP документом добавив его id в ref_id
    const isertRes: any = await Doc.insertOne(res.data, result.ref_id);
    if (!isertRes.acknowledged) {
      // не удалось вставить запись в лог монго.
      result.err = { errDescription: 'ошибка вставки в MongoDB' };
    }
  } catch (err) {
    result.err = err;
  }
  return result;
}
