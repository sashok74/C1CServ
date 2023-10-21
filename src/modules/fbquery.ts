import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST;
<<<<<<< HEAD
export async function db_query(proc: string, trans = 'READ_WRITE',  prm:object) {
=======
export async function db_query(proc: string, trans = 'READ_WRITE',  prm:any[]) {
>>>>>>> 9669d55 (db_test)
    console.log("db_query proc:", proc);
<<<<<<< HEAD
<<<<<<< HEAD
    const res = await axios.post(`http://${DB_HOST}:3333/query`,
    {
        'procedureName': proc, 
        'transactonType': trans,
<<<<<<< HEAD
        'prm': prm,
    }
    );
    return res.data;
=======
    const res = await axios.post(`http://${DB_HOST}:3333:/query`,
=======
    const res = await axios.post(`http://${DB_HOST}:3333/query`,
>>>>>>> bdc24ee (db_test)
    {
        'procedureName': proc, 
=======
>>>>>>> b871557 (db_test)
        'prm': prm,
    }
    );
<<<<<<< HEAD
    console.log("axios res:",res.data);
    //return response.data; // здесь возвращается JSON-ответ
>>>>>>> 67ed03b (db_test)
=======
    return res.data;
>>>>>>> cbb12d6 (db_test)
}