import { ObjectId } from 'mongodb';

export type FindResType = {'insert_at': Date, 'ref_id': string, _id:ObjectId };

export type prmSQLType = { [key: string]: unknown };

export type GetObjectType = {
    Collection: string,
    uid: string,
    _id: ObjectId|null,
    ref_id: string|null|number,
    inserting: boolean,
    finding: boolean,
    prmSQLiu: prmSQLType,
    err: any
};

export type  ObjProcessFunc = (obj: any) => void;

export const createPrm = (options = {}) => {
    const defaultOptions = {
        fName: null,
        objScheme: null,
        objUID: null,
        isArray: false,
        type: 'VARCHAR',
        len: 0
    };
    return {...defaultOptions, ...options};
};

export interface ObjectSchemType  {
    schemeName: string;
    collectionName: string; 
    queryField: string;
    servC1Path: string;
    exportProcName: string;
    objectPath: string;
    prmMap: { [key: string]: {fName: string|null, objScheme?: ObjectSchemType|null,  objUID: string|null, isArray: boolean, type: string, len: number }};
    idField: string;
    StrResField: string;
    procFn: ObjProcessFunc|null;
}