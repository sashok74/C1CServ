import { Request, Response, Router } from 'express';
import { getItemGUID, getObjectC1 } from './1cdata.js'
import { getArrayFromFile }  from './getDocLIst.js'
import { db_query } from './fbquery.js'
import { ZakazClienta, Kontragent, Catalog, City, Country, Measure, Storage, Nom, Bom, NomCnt, objectInfoMap, NomUpdate } from '../types/ExportSchemes.js';
import { nomSchema, docSchema, refSchema, c1CUID } from '../types/schemas.js';
import { validateBody } from './validateRequest.js';
import { getValueByPath } from './objHelper.js';
import { erpNewNom, erpNewCatalog} from './fromERP.js'

const routes = Router();

routes.get('/', (req, res) => {
  return res.json({ message: 'Hello World!!!' });
});

routes.post('/C1_ZC', validateBody(docSchema), async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
   const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(ZakazClienta, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Partner', validateBody(docSchema), async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Kontragent, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Catalog', validateBody(docSchema), async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Catalog, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_City', validateBody(docSchema), async (req: Request, res: Response) => {
  // сюда передаем список uid документов которые надо загрузить.
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(City, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Country', validateBody(docSchema), async (req: Request, res: Response) => {
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Country, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Storage', validateBody(docSchema), async (req: Request, res: Response) => {
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Storage, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Measure', validateBody(docSchema), async (req: Request, res: Response) => {
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Measure, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Nomenklature', validateBody(docSchema), async (req: Request, res: Response) => {
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Nom, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_Specification', validateBody(docSchema), async (req: Request, res: Response) => {
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(Bom, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_nomenclature_cnt', validateBody(docSchema), async (req: Request, res: Response) => {
  const DOC = req.body.DOC;
  const full_res:any[] = [];
  let ind = 0;
  for (const uid of DOC) {
    const doc_json = await getObjectC1(NomCnt, uid);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_set_nom_cnt_by_nom_id', validateBody(nomSchema), async (req: Request, res: Response) => {
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

// получить guid уже добавленныз записей в коллекции. 
// путь к полую guid определен в схеме имя которой передается.
routes.post('/C1_GUID', validateBody(c1CUID), async (req: Request, res: Response) => {
  const { objectName, ref_id } = req.body;
  const objectInfo = objectInfoMap.get(objectName);

  if (objectInfo) {
    const { collectionName, queryField } = objectInfo;
    const itemRes = await getItemGUID(collectionName, ref_id);
    let guid = null;

    if (itemRes) {
      guid = getValueByPath(itemRes, queryField) as string;
    }

    res.status(201).json({ GUID: guid });
  } else {
    res.status(400).json({ error: 'Object not found' });
  }
});


routes.post('/ERP_NEW_NOM', validateBody(refSchema), async (req: Request, res: Response) => {
  const REF_ID = req.body.REF_ID;
  const full_res:any[] = [];
  let ind = 0;
  for (const id of REF_ID) {
    const doc_json = await erpNewNom(id);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/ERP_NEW_CATALOG', validateBody(refSchema), async (req: Request, res: Response) => {
  const REF_ID = req.body.REF_ID;
  const full_res:any[] = [];
  let ind = 0;
  for (const id of REF_ID) {
    const doc_json = await erpNewCatalog(id);
    full_res[ind++] = doc_json;
  }
  res.status(201).json(full_res);
});

routes.post('/C1_upd_nom_by_nom_id', validateBody(refSchema), async (req: Request, res: Response) => {
  const REF_ID = req.body.REF_ID;
  const full_res:any[] = [];
  let ind = 0;
  for (const ref_id of REF_ID) {
    const itemRes  = await getItemGUID('C1_Nom',ref_id);
    if (itemRes ) { 
      const uid = ((itemRes as any).response.Номенклатура.GUIDНоменклатуры) as string; //res это элемент коллекции в формате json 
      const doc_json = await getObjectC1(NomUpdate, uid, ref_id);
      full_res[ind++] = doc_json;
    }  
  }
  res.status(201).json(full_res);
});

export default routes;

