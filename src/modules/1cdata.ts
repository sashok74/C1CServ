import axios from 'axios';
import { insertC1_ZC } from '../controllers/c1_zc.route.js'
//import { getOrderResponse } from '../testData/res.getDoc.js'
import * as dotenv from 'dotenv';
dotenv.config();

const C1_WEBSERVER = process.env.C1_WEBSERVER;
export async function getDoc(uid: string) {
    console.log("getDoc uid:",uid);
    const doc = await axios.get(`http://${C1_WEBSERVER}/unf/hs/ht/get_order/${uid}`);
    console.log("axios res:",doc.data);
    //return response.data; // здесь возвращается JSON-ответ
    await insertC1_ZC(doc.data);
    //return getOrderResponse;
}

