import axios from 'axios';
import { insertC1_ZC, insertC1_Parner } from '../controllers/c1_zc.route.js'
//import { getOrderResponse } from '../testData/res.getDoc.js'
import * as dotenv from 'dotenv';
dotenv.config();

const C1_WEBSERVER = process.env.C1_WEBSERVER;

export async function getDoc(uid: string) {
    console.log("getDoc uid:",uid);
    const res = await axios.get(`http://${C1_WEBSERVER}/unf/hs/ht/get_order/${uid}`);
    console.log("axios res:",res.data);
    //return response.data; // здесь возвращается JSON-ответ
    //сперва проверим все вложеные объекты
    //контрагент.
    await getPartner(res.data.response.ЗаказПокупателя.КонтрагентЗаказаПокупателя.GUIDКонтрагента);
    await insertC1_ZC(res.data);
    //return getOrderResponse;
}

export async function getPartner(uid: string) {
    console.log("getDoc uid:",uid);
    const res = await axios.get(`http://${C1_WEBSERVER}/unf/hs/ht/get_partner/${uid}`);
    console.log("axios res:",res.data);
    //return response.data; // здесь возвращается JSON-ответ
    await insertC1_Parner(res.data);
    //return getOrderResponse;
}
