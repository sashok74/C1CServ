import { Request, Response } from 'express';
import { ObjectId } from "mongodb";
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
    const today = new Date();
    const db = await loadDB();
    const uitems = await db.collection('C1_ZC').findOne(
      { 'response.ЗаказПокупателя.GUIDЗаказаПокупателя': prm.response.ЗаказПокупателя.GUIDЗаказаПокупателя }
    );
    if (uitems === null){
      const newrec = await db.collection('C1_ZC').insertOne({...prm, 'res':{'insert_at': today}});
      console.log('insert record:', newrec);
    }
  } catch (error) {
    console.log('error:', error);
  }
}
