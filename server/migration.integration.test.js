import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createClient } from '@libsql/client';
import { PGlite } from '@electric-sql/pglite';
import { createPgliteAdapter, migrateDb } from './db.js';
import { migrateTursoToPostgres } from '../scripts/migrate-turso-to-postgres.js';

const resources = [];

afterEach(async () => {
  while (resources.length > 0) await resources.pop().close();
});

async function createSource() {
  const source = createClient({ url: ':memory:' });
  resources.push(source);
  await source.executeMultiple(`
    CREATE TABLE tenants (id TEXT, name TEXT, code TEXT, config TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE users (id TEXT, tenant_id TEXT, email TEXT, password_hash TEXT, name TEXT, role TEXT, phone TEXT, agency TEXT, active INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE dossiers (id TEXT, tenant_id TEXT, agent_id TEXT, applicant_name TEXT, amount_requested INTEGER);
    CREATE TABLE evidence (id TEXT, dossier_id TEXT, tenant_id TEXT, category TEXT, label TEXT, source TEXT, verification_level TEXT);
    CREATE TABLE evidence_attachments (id TEXT, evidence_id TEXT, dossier_id TEXT, tenant_id TEXT, original_name TEXT, mime_type TEXT, size_bytes INTEGER, sha256 TEXT, content BLOB, created_by TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE cashflow_entries (id TEXT, dossier_id TEXT, tenant_id TEXT, month INTEGER, year INTEGER, revenue INTEGER, expenses INTEGER, debt_payments INTEGER);
  `);
  await source.batch([
    { sql: 'INSERT INTO tenants VALUES (?, ?, ?, ?, ?, ?)', args: ['t1', 'Test', 'TEST', '{}', '2026-01-01', '2026-01-01'] },
    { sql: 'INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', args: ['u1', 't1', 'a@test.sn', 'hash', 'Agent', 'AGENT', null, null, 1, '2026-01-01', '2026-01-01'] },
    { sql: 'INSERT INTO dossiers (id, tenant_id, agent_id, applicant_name, amount_requested) VALUES (?, ?, ?, ?, ?)', args: ['d1', 't1', 'u1', 'Demandeur', 100000] },
    { sql: 'INSERT INTO evidence VALUES (?, ?, ?, ?, ?, ?, ?)', args: ['e1', 'd1', 't1', 'document', 'Contrat', 'agent', 'B'] },
    { sql: 'INSERT INTO evidence_attachments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', args: ['a1', 'e1', 'd1', 't1', 'preuve.pdf', 'application/pdf', 4, 'sha', Buffer.from('%PDF'), 'u1', '2026-01-01', '2026-01-01'] },
    { sql: 'INSERT INTO cashflow_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)', args: ['c1', 'd1', 't1', 1, 2026, 100, 20, 10] },
  ]);
  return source;
}

async function createTarget() {
  const database = new PGlite();
  const target = createPgliteAdapter(database);
  resources.push(target);
  await migrateDb(target);
  return database;
}

test('le dry-run valide le transfert complet puis annule les écritures', async () => {
  const source = await createSource();
  const target = await createTarget();
  const result = await migrateTursoToPostgres({
    sourceClient: source,
    targetClient: target,
    sourcePageSize: 1,
    insertBatchSize: 2,
  });

  assert.equal(result.applied, false);
  assert.equal(result.counts.tenants, 1);
  assert.equal((await target.query('SELECT COUNT(*)::integer AS count FROM tenants')).rows[0].count, 0);
});

test('le transfert paginé conserve les binaires et laisse PostgreSQL calculer net_flow', async () => {
  const source = await createSource();
  const target = await createTarget();
  const result = await migrateTursoToPostgres({
    sourceClient: source,
    targetClient: target,
    apply: true,
    sourcePageSize: 1,
    insertBatchSize: 2,
  });

  assert.equal(result.applied, true);
  const attachment = (await target.query('SELECT content FROM evidence_attachments')).rows[0];
  assert.equal(Buffer.from(attachment.content).toString(), '%PDF');
  const cashflow = (await target.query('SELECT net_flow FROM cashflow_entries')).rows[0];
  assert.equal(cashflow.net_flow, 70);
});

test('le transfert refuse une cible non vide avant toute écriture', async () => {
  const source = await createSource();
  const target = await createTarget();
  await target.query("INSERT INTO tenants (id, name, code) VALUES ('existing', 'Existant', 'EXIST')");

  await assert.rejects(() => migrateTursoToPostgres({ sourceClient: source, targetClient: target }));
  assert.equal((await target.query('SELECT COUNT(*)::integer AS count FROM tenants')).rows[0].count, 1);
});
