import { ObjectId } from 'mongodb';

export type FindResType = { insert_at: Date; ref_id: string; _id: ObjectId };

export type prmSQLType = { [key: string]: unknown };

export type GetObjectType = {
  Collection: string;
  uid: string;
  _id: ObjectId | null;
  ref_id: string | null | number;
  inserting: boolean;
  finding: boolean;
  prmSQLiu: prmSQLType;
  err: any;
};

export const createGetObjectType = (options = {}):GetObjectType => {
    const defaultOptions:GetObjectType = {
        Collection: '',
        uid: '',
        _id: null,
        ref_id: null,
        inserting: false,
        finding: false,
        prmSQLiu: {},
        err: null,
    };
    return { ...defaultOptions, ...options };
  };

export interface prmMapType {
  [key: string]: {
    fName: string | null;
    objScheme?: ObjectSchemType | null;
    objUID: string | null;
    type: string;
    len: number;
  };
}

export const createPrm = (options = {}) => {
    const defaultOptions = {
      fName: null,
      objScheme: null,
      objUID: null,
      type: 'VARCHAR',
      len: 0,
    };
    return { ...defaultOptions, ...options };
  };

export interface ObjectSchemType {
  schemeName: string;
  collectionName: string;
  queryField: string;
  servC1Path: string;
  exportProcName: string;
  objectPath: string;
  prmMap: prmMapType;
  idField: string;
  StrResField: string
}
