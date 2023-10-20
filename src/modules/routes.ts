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
  for (const uid of DOC) {
    console.log("route C1_ZC uid:", uid);
    const doc_json = await getDoc(uid);
    console.log("route C1_ZC doc:",doc_json);
  }

  res.send('All documents retrieved.');
});

routes.get('/test_db', async (req: Request, res: Response) => {
  const result = db_query('MET$PROC_INFO_S',[{'PROC_NAME_IN': 'MET$PROC_INFO_S'}]);
  res.status(201).json(result).send();
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
