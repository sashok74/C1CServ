import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST;
export async function db_query(proc: string, prm:any[]) {
    console.log("db_query proc:", proc);
    const res = await axios.post(`http://${DB_HOST}:3333/query`,{prm});
    console.log("axios res:",res.data);
    //return response.data; // здесь возвращается JSON-ответ
}