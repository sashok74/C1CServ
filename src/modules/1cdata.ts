import axios from 'axios';
import { insertC1_ZC } from '../controllers/c1_zc.route.js'
//import { getOrderResponse } from '../testData/res.getDoc.js'

export async function getDoc(uid: string) {
    console.log("getDoc uid:",uid);
    const doc = await axios.get(`http://192.168.10.183/unf/hs/ht/get_order/${uid}`);
    console.log("axios res:",doc);
    //return response.data; // здесь возвращается JSON-ответ
    insertC1_ZC(doc.data);
    //return getOrderResponse;
}

