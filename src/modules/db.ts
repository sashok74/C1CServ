import dotenv from 'dotenv';
import {  Db, MongoClient } from 'mongodb';
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
    } catch (err) {
        Sentry.captureException(err);
    }
    return db;
};


