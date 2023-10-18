import { Request, Response, Router } from 'express';
import { getDoc } from './1cdata.js'
import { getArrayFromFile }  from './getDocLIst.js'

const routes = Router();

routes.get('/', (req, res) => {
  return res.json({ message: 'Hello World!!!' });
});

routes.post('/C1_ZP', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  const DOC = req.body.DOC;

  for (const uid of DOC) {
    const doc_json = await getDoc(uid);
    console.log(doc_json);
  }

  res.send('All documents retrieved.');
});


routes.post('/C1_ZP_FILE', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  const DOC  = await getArrayFromFile("../testData/docUID.txt");
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
