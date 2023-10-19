import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { loadDB } from '../modules/db.js';
//import { Tposts, Tthemes } from '../types/chatDB.js';

export async function allC1_ZC(req: Request, res: Response) {
  try {
    let db = await loadDB();
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
    let db = await loadDB();
    if (!prm._id) {
      prm._id = new ObjectId();
      prm.created_at = new Date();
      prm.updated_at = undefined;
    } else {
      prm._id = new ObjectId(prm._id);
      prm.updated_at = new Date();
    }
    prm.p_id = prm.p_id ? new ObjectId(prm.p_id) : null;

    let updateObj = {
      $setOnInsert: {
        _id: prm._id,
        created_at: prm.created_at,
      },
      $set: {
        updated_at: prm.updated_at,
      },
    };
    console.log(db.listCollections({nameOnly: true}).toArray());
    const uitems = await db.collection('C1_ZC').findOneAndUpdate({ _id: prm._id }, updateObj, {
      upsert: true,
      returnDocument: 'after',
    });
    console.log('after:', uitems);
  } catch (error) {
    console.log('error:', error);
  }
}
