import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@libsql/client';
import { initDb } from './db.js';
import { DEMO_DOSSIER_IDS, seedDemoDossiers } from './demoSeed.js';
import { SCORE_VERSION } from './services/prequalification.js';

const env = {
  NODE_ENV: 'test',
  FRESCOOP_DEMO_SEED_ENABLED: 'true',
  FRESCOOP_DEMO_TENANT_CODE: 'DEMO-TENANT',
  FRESCOOP_DEMO_AGENT_EMAIL: 'agent-demo@example.invalid',
};

async function setup() {
  const db = createClient({ url: `file:demo-seed-${randomUUID()}` });
  await initDb(db);
  await db.execute({ sql: 'INSERT INTO tenants (id, name, code) VALUES (?, ?, ?)', args: ['tenant-demo', 'Tenant démo', env.FRESCOOP_DEMO_TENANT_CODE] });
  await db.execute({
    sql: `INSERT INTO users (id, tenant_id, email, password_hash, name, role, active)
          VALUES (?, ?, ?, 'test', 'Agent démo', 'AGENT', 1)`,
    args: ['agent-demo', 'tenant-demo', env.FRESCOOP_DEMO_AGENT_EMAIL],
  });
  const rules = [
    ['RULE-ID-001', 'NO_IDENTITY', 'NON_ELIGIBLE', 'critical'],
    ['RULE-CF-001', 'NO_CASHFLOW', 'REVUE_REQUISE', 'high'],
    ['RULE-CAP-001', 'CAPACITY_INSUFFICIENT', 'NON_ELIGIBLE', 'critical'],
    ['RULE-CAP-002', 'CAPACITY_STRESSED', 'REVUE_REQUISE', 'high'],
    ['RULE-DEBT-001', 'HIGH_EXISTING_DEBT', 'REVUE_REQUISE', 'high'],
    ['RULE-BIC-001', 'LATE_PAYMENTS', 'REVUE_REQUISE', 'high'],
    ['RULE-EV-001', 'LOW_EVIDENCE', 'REVUE_REQUISE', 'medium'],
    ['RULE-EV-002', 'MOSTLY_DECLARATIVE', 'REVUE_REQUISE', 'medium'],
    ['RULE-SEAS-001', 'SEASONAL_MISMATCH', 'REVUE_REQUISE', 'medium'],
    ['RULE-AMT-001', 'AMOUNT_HIGH_VS_REVENUE', 'REVUE_REQUISE', 'medium'],
    ['RULE-AGRO-001', 'AGRONOMIC_ADJUSTMENT', 'REVUE_REQUISE', 'medium'],
    ['RULE-AGRO-002', 'AGRONOMIC_HUMAN_REVIEW', 'REVUE_REQUISE', 'high'],
  ];
  for (const [code, condition, result, severity] of rules) {
    await db.execute({
      sql: `INSERT INTO rules (id, tenant_id, code, name, condition_expr, result, severity)
            VALUES (?, 'tenant-demo', ?, ?, ?, ?, ?)`,
      args: [`rule-${code}`, code, code, condition, result, severity],
    });
  }
  return db;
}

async function snapshots(db) {
  const result = await db.execute({
    sql: `SELECT id, applicant_name, prequalification, repayment_capacity,
                 prequalification_score, prequalification_score_version,
                 prequalification_score_details, created_at, updated_at
          FROM dossiers WHERE id LIKE 'demo-%' ORDER BY id`,
  });
  return result.rows.map(row => ({ ...row }));
}

test('crée quatre profils stables calculés par le score FresCoop v4', async () => {
  const db = await setup();
  const result = await seedDemoDossiers({ db, env });
  assert.deepEqual(result, { enabled: true, created: 4, existing: 0 });
  const rows = await snapshots(db);
  assert.deepEqual(rows.map(row => row.id), [...DEMO_DOSSIER_IDS].sort());
  assert.ok(rows.every(row => row.prequalification_score_version === SCORE_VERSION));
  assert.ok(rows.every(row => JSON.parse(row.prequalification_score_details).version === SCORE_VERSION));
  const scores = Object.fromEntries(rows.map(row => [row.id, row.prequalification_score]));
  assert.equal(scores['demo-solide'], 84);
  assert.equal(scores['demo-intermediaire'], 50);
  assert.equal(scores['demo-saisonnier'], 93);
  assert.equal(scores['demo-stress'], 20);
  const byId = Object.fromEntries(rows.map(row => [row.id, row]));
  assert.deepEqual(
    [...new Set(rows.map(row => row.prequalification))].sort(),
    ['NON_ELIGIBLE', 'PREQUALIFIE', 'REVUE_REQUISE'],
  );
  assert.deepEqual(
    [...new Set(rows.map(row => row.repayment_capacity))].sort(),
    ['INSUFFICIENT', 'LIMIT', 'SUFFICIENT'],
  );
  assert.equal(byId['demo-stress'].prequalification, 'NON_ELIGIBLE');
  const componentProfiles = new Set(rows.map(row => JSON.stringify(
    JSON.parse(row.prequalification_score_details).components,
  )));
  assert.ok(componentProfiles.size >= 3);

  const projects = await db.execute(`SELECT dossier_id, feasibility_status, feasibility_mode,
                                            teranga_yield
                                     FROM agricultural_project_assessments
                                     WHERE id LIKE 'demo-%' ORDER BY dossier_id`);
  assert.deepEqual(projects.rows.map(row => row.feasibility_status), [
    'FEASIBLE', 'FEASIBLE', 'FEASIBLE', 'HUMAN_REVIEW',
  ]);
  assert.ok(projects.rows.every(row => row.feasibility_mode === 'local'));
  assert.ok(projects.rows.every(row => row.teranga_yield == null));

  const evidence = await db.execute(`SELECT DISTINCT verification_level
                                     FROM evidence WHERE id LIKE 'demo-%'
                                     ORDER BY verification_level`);
  assert.deepEqual(evidence.rows.map(row => row.verification_level), ['A', 'B', 'C', 'D']);
});

test('la seconde exécution ne modifie aucune ligne', async () => {
  const db = await setup();
  await seedDemoDossiers({ db, env });
  const before = await snapshots(db);
  const result = await seedDemoDossiers({ db, env });
  assert.deepEqual(result, { enabled: true, created: 0, existing: 4 });
  assert.deepEqual(await snapshots(db), before);
});

test('une collision partielle échoue sans toucher aux données existantes', async () => {
  const db = await setup();
  await db.execute({
    sql: `INSERT INTO dossiers (id, tenant_id, agent_id, status, applicant_name)
          VALUES ('real-existing', 'tenant-demo', 'agent-demo', 'draft', 'Donnée réelle témoin')`,
  });
  await db.execute({
    sql: `INSERT INTO dossiers (id, tenant_id, agent_id, status, applicant_name)
          VALUES ('demo-solide', 'tenant-demo', 'agent-demo', 'draft', 'Donnée préexistante')`,
  });
  await assert.rejects(seedDemoDossiers({ db, env }), /collision/);
  const all = await db.execute('SELECT id, applicant_name FROM dossiers ORDER BY id');
  assert.deepEqual(all.rows.map(row => ({ ...row })), [
    { id: 'demo-solide', applicant_name: 'Donnée préexistante' },
    { id: 'real-existing', applicant_name: 'Donnée réelle témoin' },
  ]);
});

test('refuse un manifeste démo ayant dérivé sans le réparer', async () => {
  const db = await setup();
  await seedDemoDossiers({ db, env });
  await db.execute({
    sql: `UPDATE evidence SET verification_level = 'A'
          WHERE id = 'demo-intermediaire-evidence-1'`,
  });
  const before = await snapshots(db);
  await assert.rejects(seedDemoDossiers({ db, env }), /dérive/);
  assert.deepEqual(await snapshots(db), before);
  const evidence = await db.execute({
    sql: 'SELECT verification_level FROM evidence WHERE id = ?',
    args: ['demo-intermediaire-evidence-1'],
  });
  assert.equal(evidence.rows[0].verification_level, 'A');
});

test('une panne forcée annule la transaction entière', async () => {
  const db = await setup();
  await assert.rejects(seedDemoDossiers({
    db,
    env,
    hooks: { afterProfile: key => { if (key === 'intermediaire') throw new Error('panne forcée'); } },
  }), /panne forcée/);
  assert.deepEqual(await snapshots(db), []);
  for (const table of ['agricultural_project_assessments', 'agricultural_input_items', 'evidence',
    'declared_debts', 'cashflow_entries', 'rule_evaluations']) {
    const result = await db.execute(`SELECT COUNT(*) AS count FROM ${table} WHERE id LIKE 'demo-%'`);
    assert.equal(Number(result.rows[0].count), 0);
  }
});

test('n’appelle aucun service externe et n’injecte aucun score dans les créations', async () => {
  const db = await setup();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('réseau interdit'); };
  const executed = [];
  const instrumented = {
    execute: statement => db.execute(statement),
    transaction: async mode => {
      const transaction = await db.transaction(mode);
      return {
        get closed() { return transaction.closed; },
        execute: statement => transaction.execute(statement),
        batch: statements => {
          executed.push(...statements);
          return transaction.batch(statements);
        },
        commit: () => transaction.commit(),
        rollback: () => transaction.rollback(),
        close: () => transaction.close(),
      };
    },
  };
  try {
    await seedDemoDossiers({ db: instrumented, env });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(calls, 0);
  const dossierInserts = executed.filter(statement => /^INSERT INTO dossiers/.test(statement.sql.trim()));
  assert.equal(dossierInserts.length, 4);
  assert.ok(dossierInserts.every(statement => !statement.sql.includes('prequalification_score')));
});

test('reste désactivé sans drapeau explicite et exige l’accusé production', async () => {
  const db = await setup();
  assert.deepEqual(await seedDemoDossiers({ db, env: {} }), { enabled: false, created: 0, existing: 0 });
  await assert.rejects(seedDemoDossiers({ db, env: { ...env, NODE_ENV: 'production' } }), /production/);
});
