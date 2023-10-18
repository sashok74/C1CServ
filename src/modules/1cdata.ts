import axios from 'axios';
import { insertC1_ZC } from '../controllers/c1_zc.route.js'
//import { getOrderResponse } from '../testData/res.getDoc.js'

export async function getDoc(uid: string) {
    const doc = await axios.get(`http://192.168.10.183/unf/hs/ht/get_order/${uid}`);

    //return response.data; // здесь возвращается JSON-ответ
    insertC1_ZC(doc.data);
    console.log(uid);
    //return getOrderResponse;
}

