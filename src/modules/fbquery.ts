import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST;
export async function db_query(proc: string, trans = 'READ_WRITE',  prm:any[]) {
    console.log("db_query proc:", proc);
    const res = await axios.post(`http://${DB_HOST}:3333/query`,
    {
        'procedureName': proc, 
        'prm': prm,
        'transactonType':trans
    }
    );
    return res.data;
}