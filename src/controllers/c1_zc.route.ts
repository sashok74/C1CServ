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

export async function GetCollectionDriver (collectionName: string, queryField: string) {
  return new MongoDBCollection(collectionName, queryField);
}