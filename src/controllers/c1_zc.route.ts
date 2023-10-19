import { Request, Response } from 'express';

import { loadDB } from '../modules/db.js';


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

export async function insertC1_ZC(prm: any) {
  try {
    const db = await loadDB();
    console.log('listCollections :', db.listCollections().toArray());
    const uitems = await db.collection('C1_ZC').findOneAndUpdate(
      { 'response.ЗаказПокупателя.GUIDЗаказаПокупателя': prm.response.ЗаказПокупателя.GUIDЗаказаПокупателя },
      {
        $setOnInsert: { 'res.insert_at': new Date() }, // если документ вставляется
        $set: { 'res.update_at': new Date() }, // если документ обновляется,
      },
      {
        upsert: false,
        returnDocument: 'after',
      },
    );
    console.log('insert record:', uitems);
  } catch (error) {
    console.log('error:', error);
  }
}
