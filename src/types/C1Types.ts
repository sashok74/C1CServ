import { ObjectId } from 'mongodb';

export type FindResType = {'insert_at': Date, 'ref_id': string, _id:ObjectId };

export type GetObjectType = {
    Collection: string,
    uid: string,
    ref_id: string|null,
    inserting: boolean,
    finding: boolean
    err: any
};