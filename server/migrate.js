import { closeDb, initDb } from './db.js';

try {
  const db = await initDb();
  const applied = await db.execute('SELECT name, applied_at FROM schema_migrations ORDER BY name');
  console.log(`[FresCoop] Schéma PostgreSQL prêt (${applied.rows.length} migration(s))`);
} catch (error) {
  console.error(`[FresCoop] Migration PostgreSQL impossible: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
