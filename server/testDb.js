import { PGlite } from '@electric-sql/pglite';
import { createPgliteAdapter, migrateDb, setDbForTests } from './db.js';

export async function usePgliteTestDb() {
  const database = new PGlite();
  const db = createPgliteAdapter(database);
  setDbForTests(db);
  await migrateDb(db);
  return db;
}
