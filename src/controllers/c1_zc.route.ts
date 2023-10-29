import { Request, Response } from 'express';
import { loadDB, MongoDBCollection } from '../modules/db.js';

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

export async function GetCollectionDriver(collectionName: string, queryField: string) {
  if (collectionName.length === 0) {
    return null;
  } else {
    return new MongoDBCollection(collectionName, queryField);
  }
}
