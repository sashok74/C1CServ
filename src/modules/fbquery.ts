import axios from 'axios';
import * as dotenv from 'dotenv';
import { prmSQLType, prmMapType } from '../types/C1Types.js';
import { getValueByPath } from './objHelper.js';
dotenv.config();

const DB_HOST = process.env.DB_HOST;
export async function db_query(proc: string, trans = 'READ_WRITE',  prm:object) {
    console.log("db_query proc:", proc);
    const res = await axios.post(`http://${DB_HOST}:3333/query`,
    {
        'procedureName': proc, 
        'transactonType': trans,
        'prm': prm,
    }
    );
    return res.data;
}

// функция принимает массив имя параметра SQL запроса - путь до значения, размер текстового поля. 
// и заполняет объект prm имя параметра - значение.
export async function getPrmSQLType(inArr: prmMapType, data: any) : Promise<prmSQLType> {
    const prm: prmSQLType = {};
    // console.log('getPrmSQLType inArr:', data);
    for (const key in inArr) {
      if (inArr[key].fName != null) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore: Object is possibly 'null'.
        const path: string = inArr[key].fName;
        let value = getValueByPath(data, path);
        if (
          inArr[key].len > 0 &&
          inArr[key].type === 'VARCHAR' &&
          inArr[key].objScheme === null
        ) {
          value = value.substring(0, inArr[key].len);
        } else if (inArr[key].objScheme != null) {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore: Object is possibly 'null'.
          const uid = getValueByPath(value, inArr[key].objUID);
          console.log(`getObjectC1 uid: ${uid}`, inArr[key].objScheme);
  
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore: Object is possibly 'null'.
          const res = await getObjectC1(inArr[key].objScheme, uid);
          value = res.ref_id;
          prm[`${key}_NESTED`] = res;
        }
        console.log(`getPrmSQLType prm[${key}]:`, value);
        prm[key] = value;
      }
    }  
    console.log('getObjectC1 prm:', prm);
    return prm;
  }
  