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

export type  ObjProcessFunc = (obj: any) => void;

export interface ObjectSchemType  {
    schemeName: string;
    collectionName: string; 
    queryField: string;
    servC1Path: string;
    exportProcName: string;
    prmMap: { [key: string]: string };
    idField: string;
    procFn: ObjProcessFunc|null;
}