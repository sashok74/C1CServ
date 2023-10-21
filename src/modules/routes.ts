import { Request, Response, Router } from 'express';
import { getDoc } from './1cdata.js'
import { getArrayFromFile }  from './getDocLIst.js'
import { db_query } from './fbquery.js'

const routes = Router();

routes.get('/', (req, res) => {
  return res.json({ message: 'Hello World!!!' });
});

routes.post('/C1_ZC', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getDoc(uid);
    full_res[ind++] = doc_json;
  }

  res.status(201).json(full_res);
});

routes.get('/test_db', async (req: Request, res: Response) => {
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
<<<<<<< HEAD
  const result = await db_query('SYS$GET_DB_INFO', 'READ_ONLY', {ECHO_STRING_IN: 'тест базы данных'});
=======
  const result = await db_query('SYS$GET_DB_INFO', 'READ_ONLY', [{'ECHO_STRING_IN': 'тест базы данных'}]);
>>>>>>> 9669d55 (db_test)
=======
  const result = await db_query('SYS$GET_DB_INFO', 'READ_WRITE', [{'ECHO_STRING_IN': 'тест базы данных'}]);
>>>>>>> 654f20f (db_test)
=======
  const result = await db_query('SYS$GET_DB_INFO', 'READ_ONLY', [{'ECHO_STRING_IN': 'тест базы данных'}]);
>>>>>>> 64a60a6 (db_test)
  res.status(201).json(result);
=======
  const result = db_query('MET$PROC_INFO_S',[{'PROC_NAME_IN': 'MET$PROC_INFO_S'}]);
  res.status(201).json(result).send();
>>>>>>> 44a0d28 (db_test)
=======
  const result = await db_query('MET$PROC_INFO_S',[{'PROC_NAME_IN': 'MET$PROC_INFO_S'}]);
=======
  const result = await db_query('SYS$GET_DB_INFO',[{'ECHO_STRING_IN': 'тест базы данных'}]);
>>>>>>> a2367a4 (db_test)
  res.status(201).json(result);
>>>>>>> 0af67ab (db_test)
});

routes.post('/C1_ZC_FILE', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  const DOC  = await getArrayFromFile("/root/node-app/C1CServ/src/testData/docUID.txt");
  if (DOC === undefined) {
    res.send('zero documents retrieved.');
    return;
  }

  for (const uid of DOC) {
    const doc_json = await getDoc(uid);
    console.log(doc_json);
  }

  res.send('All documents retrieved.');
});

export default routes;
