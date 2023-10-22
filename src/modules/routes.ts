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
  const result = await db_query('SYS$GET_DB_INFO', 'READ_ONLY', {ECHO_STRING_IN: 'тест базы данных'});
  res.status(201).json(result);
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
