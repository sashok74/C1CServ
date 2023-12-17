import { Request, Response, Router } from 'express';
import { getItemGUID, getObjectC1 } from './1cdata.js'
import { getArrayFromFile }  from './getDocLIst.js'
import { db_query } from './fbquery.js'
import { ZakazClienta, Kontragent, Catalog, City, Country, Measure, Storage, Nom, Bom, NomCnt } from '../types/ExportSchemes.js';
import { nomSchema, docSchema } from '../types/schemas.js';
//import Ajv from 'ajv';
import _Ajv from "ajv";

const Ajv = _Ajv as unknown as typeof _Ajv.default;
const ajv = new Ajv(); 
const validateNom = ajv.compile(nomSchema);
const validateDoc = ajv.compile(docSchema);

const routes = Router();

routes.get('/', (req, res) => {
  return res.json({ message: 'Hello World!!!' });
});

routes.post('/C1_ZC', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }  
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(ZakazClienta, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Partner', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Kontragent, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Catalog', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Catalog, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_City', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(City, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Country', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Country, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Storage', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Storage, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Measure', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Measure, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Nomenklature', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Nom, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Specification', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Bom, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_nomenclature_cnt', async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(NomCnt, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_set_nom_cnt_by_nom_id', async (req: Request, res: Response) => {
  // сюда передаем список nom_id номенклатуры для которой надо установить количество .
  if (!validateNom(req.body.NOM)) {
    return res.status(400).json({ errors: validateNom.errors });
  }
  const NOM = req.body.NOM;
  const full_res:any[] = [];
  let ind = 0;
  for (const ref_id of NOM) {
    const itemRes  = await getItemGUID('C1_Nom',ref_id);
    if (itemRes ) { 
      const uid = ((itemRes as any).response.Номенклатура.GUIDНоменклатуры) as string; //res это элемент коллекции в формате json 
      const doc_json = await getObjectC1(NomCnt, uid);
      full_res[ind++] = doc_json;
    }  
  }
  res.status(201).json(full_res);
});

routes.get('/test_db', async (req: Request, res: Response) => {
  const result = await db_query('SYS$GET_DB_INFO', 'READ_WRITE', {ECHO_STRING_IN: 'тест базы данных'});
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
    const doc_json = await getObjectC1(ZakazClienta, uid);
    console.log(doc_json);
  }

  res.send('All documents retrieved.');
});

export default routes;
