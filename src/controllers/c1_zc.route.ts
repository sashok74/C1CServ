import { Request, Response } from 'express';
<<<<<<< HEAD
import { loadDB, MongoDBCollection } from '../modules/db.js';
=======
import { loadDB } from '../modules/db.js';
>>>>>>> 7a51c99 (db_test)


export async function allC1_ZC(req: Request, res: Response) {
  try {
    const db = await loadDB();
    // Коллекция существует, вставляем запись.
    const items = await db.collection('C1_ZC').find().toArray();
    res.send(items);
  } catch (error) {
    console.log('error:', error);
    res.status(500).send(error);
  }
}

<<<<<<< HEAD
export async function GetCollectionDriver (collectionName: string, queryField: string) {
  return new MongoDBCollection(collectionName, queryField);
=======
export async function insertC1_ZC(prm: any) {
  try {
    const today = new Date();
    const db = await loadDB();
    const uitems = await db.collection('C1_ZC').findOne(
      { 'response.ЗаказПокупателя.GUIDЗаказаПокупателя': prm.response.ЗаказПокупателя.GUIDЗаказаПокупателя }
    );
    if (uitems === null){
      const newrec = await db.collection('C1_ZC').insertOne({...prm, 'res':{'insert_at': today, 'ref_id': null}});
      console.log('insert record:', newrec);
    }
    else{
      console.log('find record:', uitems);
    }
  } catch (error) {
    console.log('error:', error);
  }
}

export async function insertC1_Parner(prm: any) {
  try {
    const today = new Date();
    const db = await loadDB();
    const uitems = await db.collection('C1_ZC').findOne(
      { 'response.ЗаказПокупателя.GUIDЗаказаПокупателя': prm.response.Контрагент.GUIDКонтрагента }
    );
    if (uitems === null){
      const newrec = await db.collection('C1_Partner').insertOne({...prm, 'res':{'insert_at': today, 'ref_id': null}});
      console.log('insert record:', newrec);
    }
    else{
      console.log('find record:', uitems);
    }
  } catch (error) {
    console.log('error:', error);
  }
>>>>>>> 8c0cae1 (partner)
}