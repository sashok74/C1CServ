import dotenv from 'dotenv';
import {  Db, MongoClient, Collection,  } from 'mongodb';
import { FindResType } from '../types/C1Types.js';
import * as Sentry from '@sentry/node';

dotenv.config();
const user_name = process.env.MONGODB_USER;
const base_name = process.env.MONGODB_BASE;
const dbUrl = `mongodb://${user_name}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_SERVER}:27017/${base_name}?retryWrites=true&w=majority`;

let db:Db;

export const loadDB = async () => {
    if (db) {
        return db;
    }
    try {
        console.log(dbUrl);
        const client = await MongoClient.connect(dbUrl);
        await client.connect();
        db = client.db(base_name);
        const uitems = await db.collection('log.connections').insertOne({ date: new Date(), username: 'ind' });
        console.log('db connect:', uitems);
    } catch (err) {
        Sentry.captureException(err);
    }
    return db;
};

type QueryType = { [key: string]: unknown };

export class MongoDBCollection {
    private readonly collection: Promise<Collection>;
    private readonly db:Promise<Db>;

    constructor(
      private readonly collectionName: string,
      private readonly queryField: string
    ) {
      this.db = loadDB();
      this.collection = this.getCollection();
    }
  
    private async getCollection(): Promise<Collection> {
      const db = await this.db;
      return db.collection(this.collectionName);
    }
    
    async insertOne(doc: object, ref_id: string|null): Promise<unknown> {
      const collection = await this.collection;
      return collection.insertOne({...doc, 'res':{'insert_at': new Date(), 'ref_id': ref_id}});
    }
  
    async find(query: QueryType): Promise<unknown[]> {
      const collection = await this.collection;
      return collection
        .find({ [this.queryField]: query[this.queryField] }) 
        .toArray();
    }

    async findOne(key: any): Promise<FindResType> {
        console.log('findOne prm:', { [this.queryField]: key });
        const collection = await this.collection;
        return collection
          .findOne({ [this.queryField]: key })
          .then(data => data ? {...data.res, _id: data._id} : { insert_at: null, ref_id: null, _id: null });
     }    
  }

