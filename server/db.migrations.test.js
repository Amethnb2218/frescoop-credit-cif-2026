import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { initDb } from './db.js';

test('le schéma neuf distingue un score absent d’un score réel à zéro', async () => {
  const db = createClient({ url: 'file::memory:' });
  await initDb(db);

  const info = await db.execute('PRAGMA table_info(dossiers)');
  const columns = Object.fromEntries(info.rows.map(row => [String(row.name), row]));
  assert.equal(columns.prequalification_score.notnull, 0);
  assert.equal(columns.prequalification_score.dflt_value, null);
  assert.equal(columns.interest_calculation_mode.dflt_value, "'rate'");

  await db.execute("INSERT INTO tenants (id, name, code) VALUES ('tenant', 'Tenant', 'TENANT')");
  await db.execute(`INSERT INTO users (id, tenant_id, email, password_hash, name, role)
                    VALUES ('agent', 'tenant', 'agent@example.invalid', 'hash', 'Agent', 'AGENT')`);
  await db.execute(`INSERT INTO dossiers (id, tenant_id, agent_id)
                    VALUES ('sans-score', 'tenant', 'agent')`);
  await db.execute(`INSERT INTO dossiers (id, tenant_id, agent_id, prequalification_score)
                    VALUES ('score-zero', 'tenant', 'agent', 0)`);

  const scores = await db.execute('SELECT id, prequalification_score FROM dossiers ORDER BY id');
  assert.equal(scores.rows[0].prequalification_score, null);
  assert.equal(scores.rows[1].prequalification_score, 0);
  db.close();
});

test('la migration conserve les scores et annualise les intérêts selon la durée', async () => {
  const db = createClient({ url: 'file::memory:' });
  await db.executeMultiple(`
    CREATE TABLE dossiers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      amount_requested INTEGER,
      duration_months INTEGER,
      desired_schedule TEXT,
      interest_rate REAL,
      interest_amount INTEGER DEFAULT 0,
      total_repayable INTEGER DEFAULT 0,
      prequalification_score INTEGER,
      prequalification_score_details TEXT,
      prequalification_score_version INTEGER,
      decision TEXT,
      decision_amount INTEGER,
      decision_duration INTEGER,
      decision_schedule TEXT,
      decision_motif TEXT,
      decided_by TEXT,
      decided_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO dossiers
      (id, tenant_id, amount_requested, duration_months, desired_schedule, interest_rate,
       interest_amount, total_repayable, prequalification_score)
    VALUES
      ('flat', 'tenant', 120000, 6, 'Mensuel', 12, 0, 0, NULL),
      ('declining', 'tenant', 120000, 12, 'Dégressif', 12, 0, 0, 0),
      ('sans-duree', 'tenant', 120000, NULL, 'Mensuel', 12, 0, 0, NULL);
  `);

  await initDb(db);
  const result = await db.execute(`SELECT id, prequalification_score,
                                          interest_calculation_mode,
                                          interest_amount, total_repayable
                                   FROM dossiers ORDER BY id`);
  const rows = Object.fromEntries(result.rows.map(row => [row.id, row]));

  assert.equal(rows.flat.prequalification_score, null);
  assert.equal(rows.declining.prequalification_score, 0);
  assert.equal(rows.flat.interest_calculation_mode, 'rate');
  assert.equal(rows.flat.interest_amount, 7200);
  assert.equal(rows.flat.total_repayable, 127200);
  assert.equal(rows.declining.interest_amount, 7800);
  assert.equal(rows.declining.total_repayable, 127800);
  assert.equal(rows['sans-duree'].interest_amount, 0);
  assert.equal(rows['sans-duree'].total_repayable, 120000);
  db.close();
});
