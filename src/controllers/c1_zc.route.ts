import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { loadDB } from '../modules/db.js';
//import { Tposts, Tthemes } from '../types/chatDB.js';

export async function allC1_ZC(req: Request, res: Response) {
    try {
        let db = await loadDB();
        const items = await db.collection('c1_zc').find().toArray();
        res.send(items);
    } catch (error) {
        console.log('error:', error);
        res.status(500).send(error);
    }
};

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
                "_id": prm._id,
                "created_at": prm.created_at
            },
            $set: {
                "updated_at": prm.updated_at,
            },
        }

        const uitems = await db.collection('c1_zc').findOneAndUpdate(
            { "_id": prm._id },
            updateObj,
            {
                upsert: true,
                returnDocument: 'after'
            }
        );
    } catch (error) {
        console.log('error:', error);
    }
}


