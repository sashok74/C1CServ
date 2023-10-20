import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST;
export async function db_query(proc: string, trans = 'READ_WRITE',  prm:object) {
    console.log("db_query proc:", proc);
<<<<<<< HEAD
    const res = await axios.post(`http://${DB_HOST}:3333/query`,
    {
        'procedureName': proc, 
        'transactonType': trans,
        'prm': prm,
    }
    );
    return res.data;
=======
    const res = await axios.post(`http://${DB_HOST}:3333:/query`,
    {
        'procedureName': proc, 
        'prm': prm,
        'transactonType':'READ_WRITE'
    }
    );
    console.log("axios res:",res.data);
    //return response.data; // здесь возвращается JSON-ответ
>>>>>>> 67ed03b (db_test)
}