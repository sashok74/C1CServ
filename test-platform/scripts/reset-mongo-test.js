// Очистка тестового журнала c1_data_test (все коллекции + log.connections).
// Окружение: TEST_JOURNAL_URI  mongodb://ind:...@127.0.0.1:27017/c1_data_test
import { MongoClient } from 'mongodb';

const uri = process.env.TEST_JOURNAL_URI;
if (!uri) throw new Error('TEST_JOURNAL_URI не задан');

const client = await MongoClient.connect(uri);
try {
  const db = client.db();
  const collections = await db.listCollections().toArray();
  for (const { name } of collections) {
    await db.collection(name).drop();
    console.log(`  drop ${db.databaseName}.${name}`);
  }
  console.log(`reset-mongo-test: журнал ${db.databaseName} пуст`);
} finally {
  await client.close();
}
