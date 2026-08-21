import { createClient } from '@libsql/client';
import { randomUUID } from 'crypto';

let db;

export function getDb() {
  if (db) return db;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url && authToken) {
    db = createClient({ url, authToken });
  } else {
    db = createClient({ url: 'file:server/data/frescoop.db' });
  }

  return db;
}

export async function initDb() {
  const client = getDb();

  await client.executeMultiple(`
    -- Tenants (IMFs)
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('SUPERADMIN','AGENT','SUPERVISEUR','COMITE','RISK_MANAGER','ADMIN','AUDITEUR','SUPPORT')),
      phone TEXT,
      agency TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, email)
    );

    -- Credit Dossiers
    CREATE TABLE IF NOT EXISTS dossiers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      local_id TEXT,
      agent_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','incomplete','submitted','verification','review','review_required','prequalified','committee','committee_ready','decided','exported','disbursed','monitoring','closed','cancelled')),

      -- Identity
      applicant_name TEXT,
      applicant_phone TEXT,
      applicant_id_number TEXT,
      applicant_location TEXT,
      applicant_activity TEXT,

      -- Activity
      sector TEXT,
      activity_type TEXT,
      years_experience INTEGER,
      surface_ha REAL,
      production_cycle TEXT,

      -- Credit request
      amount_requested INTEGER,
      credit_purpose TEXT,
      duration_months INTEGER,
      desired_schedule TEXT,

      -- Guarantees
      savings_amount INTEGER,
      guarantee_type TEXT,
      group_guarantee TEXT,
      other_guarantees TEXT,

      -- Assessment results (computed)
      evidence_confidence TEXT,
      repayment_capacity TEXT,
      risk_flags TEXT DEFAULT '[]',
      prequalification TEXT,
      prequalification_reasons TEXT DEFAULT '[]',
      prequalification_score INTEGER,

      -- Committee decision
      decision TEXT CHECK(decision IN ('approved','refused','complement','modified')),
      decision_amount INTEGER,
      decision_duration INTEGER,
      decision_schedule TEXT,
      decision_motif TEXT,
      decided_by TEXT REFERENCES users(id),
      decided_at TEXT,

      -- Agent note
      agent_note TEXT,

      -- Sync
      sync_status TEXT DEFAULT 'synced' CHECK(sync_status IN ('synced','pending','conflict')),
      created_offline INTEGER DEFAULT 0,

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Evidence Ledger
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT,
      amount INTEGER,
      unit TEXT,
      source TEXT NOT NULL,
      source_detail TEXT,
      verification_level TEXT NOT NULL CHECK(verification_level IN ('A','B','C','D')),
      verified_by TEXT,
      verified_at TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','expired','disputed','superseded')),
      evidence_date TEXT,
      expires_at TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Cash-flow entries (monthly)
    CREATE TABLE IF NOT EXISTS cashflow_entries (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
      year INTEGER NOT NULL,
      revenue INTEGER DEFAULT 0,
      revenue_detail TEXT DEFAULT '{}',
      expenses INTEGER DEFAULT 0,
      expenses_detail TEXT DEFAULT '{}',
      debt_payments INTEGER DEFAULT 0,
      net_flow INTEGER GENERATED ALWAYS AS (revenue - expenses - debt_payments) STORED,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Rules
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      condition_expr TEXT NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('PREQUALIFIE','REVUE_REQUISE','NON_ELIGIBLE')),
      severity TEXT DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
      active INTEGER DEFAULT 1,
      version INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );

    -- Rule evaluations (per dossier)
    CREATE TABLE IF NOT EXISTS rule_evaluations (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      rule_id TEXT NOT NULL REFERENCES rules(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      triggered INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      explanation TEXT,
      data_used TEXT DEFAULT '{}',
      evaluated_at TEXT DEFAULT (datetime('now'))
    );

    -- Risk flags
    CREATE TABLE IF NOT EXISTS risk_flags (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      code TEXT NOT NULL,
      label TEXT NOT NULL,
      description TEXT,
      severity TEXT DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
      status TEXT DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','escalated')),
      resolved_by TEXT,
      resolved_at TEXT,
      resolution_note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- BIC (Bureau d'Information sur le Credit) - simulated
    CREATE TABLE IF NOT EXISTS bic_records (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      applicant_id_number TEXT NOT NULL,
      institution TEXT,
      credit_type TEXT,
      amount INTEGER,
      outstanding INTEGER,
      monthly_payment INTEGER,
      status TEXT,
      start_date TEXT,
      end_date TEXT,
      days_late INTEGER DEFAULT 0,
      is_demo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Stress test scenarios
    CREATE TABLE IF NOT EXISTS stress_tests (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      scenario TEXT NOT NULL,
      revenue_adjustment REAL NOT NULL,
      description TEXT,
      can_repay INTEGER,
      monthly_capacity INTEGER,
      margin_percent REAL,
      recommendation TEXT,
      computed_at TEXT DEFAULT (datetime('now'))
    );

    -- Audit log
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT,
      user_name TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details TEXT DEFAULT '{}',
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Credit products
    CREATE TABLE IF NOT EXISTS credit_products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      min_amount INTEGER DEFAULT 0,
      max_amount INTEGER,
      min_duration INTEGER DEFAULT 1,
      max_duration INTEGER,
      max_rate REAL,
      eligible_sectors TEXT DEFAULT '[]',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, code)
    );

    -- Field visits
    CREATE TABLE IF NOT EXISTS field_visits (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      agent_id TEXT NOT NULL REFERENCES users(id),
      visit_date TEXT NOT NULL,
      gps_lat REAL,
      gps_lon REAL,
      observations TEXT,
      photos_count INTEGER DEFAULT 0,
      activity_confirmed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Consent records
    CREATE TABLE IF NOT EXISTS consent_records (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      applicant_name TEXT,
      consent_type TEXT NOT NULL,
      consent_given INTEGER NOT NULL DEFAULT 0,
      consent_date TEXT,
      consent_method TEXT,
      witness TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Fraud checks
    CREATE TABLE IF NOT EXISTS fraud_checks (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      check_type TEXT NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('pass','flag','alert')),
      details TEXT DEFAULT '{}',
      severity TEXT DEFAULT 'low' CHECK(severity IN ('low','medium','high','critical')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Sync queue (for offline operations)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      user_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      local_timestamp TEXT NOT NULL,
      server_timestamp TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','processing','synced','failed','conflict')),
      retry_count INTEGER DEFAULT 0,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrations for existing databases
  try { await client.execute('ALTER TABLE dossiers ADD COLUMN prequalification_score INTEGER'); } catch {}

  return client;
}

export function uuid() {
  return randomUUID();
}
