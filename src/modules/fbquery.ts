import axios from 'axios';
import * as dotenv from 'dotenv';
import { prmSQLType, prmMapType, isCharPrm } from '../types/C1Types.js';
import { getValueByPath } from './objHelper.js';
import { getObjectC1 } from './1cdata.js';
dotenv.config();

const DB_HOST = process.env.DB_HOST;
export async function db_query(proc: string, trans = 'READ_WRITE', prm: object) {
  console.log(` --- db_query proc --- : ${proc} `);
  const res = await axios.post(`http://${DB_HOST}:3333/query`, {
    procedureName: proc,
    transactonType: trans,
    prm: prm,
  });
  return res.data;
}

function getKeydNotEmpty(obj: any, field: string) {
  const keys = [];
  for (const key in obj) {
    if (obj.hasOwnProperty(key) && obj[key][field]) {
      keys.push(key);
    }
  }
  return keys;
}

// функция принимает массив имя параметра SQL запроса - путь до значения, размер текстового поля.
// и заполняет объект prm имя параметра - значение.
export async function getPrmSQLType(inArr: prmMapType, data: any): Promise<prmSQLType> {
  console.log(`getPrmSQLType`);
  //console.log(data);
  const prm: prmSQLType = {};
  let path: string|null;
  const keys = getKeydNotEmpty(inArr, 'fName');
  console.log(`keys: ${keys}`);
  for (const key of keys) {
    console.log(`key: ${key}`);
    path = inArr[key].fName;
    console.log(`getPrmSQLType path = ${path}`);
    let value = getValueByPath(data, path);
    if (isCharPrm (inArr,key)) {
      if (value) value = value.substring(0, inArr[key].len);
      else value = null;
      console.log(`value = ${value}`);
    } else if (inArr[key].objScheme != null) {
      const uid = getValueByPath(value, inArr[key].objUID);
      console.log(`getPrmSQLType uid = ${uid}`);
      if (uid) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore: Object is possibly 'null'.
        const res = await getObjectC1(inArr[key].objScheme, uid);
        value = res.ref_id;
        //prm[`${key}_NESTED`] = res;
      } else {
        value = null;
        //prm[`${key}_NESTED`] = null;
      }
    }
    prm[key] = value;
    console.log(`|  ${key} - ${path} - ${value}`);
  }
  return prm;
}
