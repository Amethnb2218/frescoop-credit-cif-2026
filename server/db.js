import { createClient } from '@libsql/client';
import { randomUUID } from 'crypto';

let db;

export function getDb() {
  if (db) return db;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    db = createClient(authToken ? { url, authToken } : { url });
  } else {
    db = createClient({ url: 'file:server/data/frescoop.db' });
  }

  return db;
}

export async function migrateAuditLogSchema(client = getDb()) {
  const requiredColumns = [
    ['user_name', 'TEXT'],
    ['user_role', 'TEXT'],
    ['details', "TEXT DEFAULT '{}'"],
    ['ip_address', 'TEXT'],
  ];
  const tableInfo = await client.execute('PRAGMA table_info(audit_log)');
  const existingColumns = new Set(tableInfo.rows.map(row => String(row.name)));
  const addedColumns = [];

  for (const [column, definition] of requiredColumns) {
    if (existingColumns.has(column)) continue;
    await client.execute(`ALTER TABLE audit_log ADD COLUMN ${column} ${definition}`);
    addedColumns.push(column);
  }

  const migratedInfo = await client.execute('PRAGMA table_info(audit_log)');
  const migratedColumns = new Set(migratedInfo.rows.map(row => String(row.name)));
  const missingColumns = requiredColumns
    .map(([column]) => column)
    .filter(column => !migratedColumns.has(column));
  if (missingColumns.length > 0) {
    throw new Error(`Migration audit_log incomplète: ${missingColumns.join(', ')}`);
  }
  if (addedColumns.length > 0) {
    console.log(`[FresCoop] Migration audit_log: ${addedColumns.join(', ')}`);
  }
  return addedColumns;
}

export async function initDb(client = getDb()) {

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
      role TEXT NOT NULL CHECK(role IN ('SUPERADMIN','AGENT','SUPERVISEUR','COMITE','RISK_MANAGER','ADMIN','AUDITEUR','SUPPORT','JURY')),
      phone TEXT,
      agency TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, email),
      UNIQUE(email)
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
      interest_calculation_mode TEXT NOT NULL DEFAULT 'rate',
      interest_rate REAL,
      interest_amount INTEGER NOT NULL DEFAULT 0,
      total_repayable INTEGER NOT NULL DEFAULT 0,

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
      prequalification_score_details TEXT NOT NULL DEFAULT '{"provisional":true,"status":"INSUFFICIENT_DATA","missing_fields":[]}',
      prequalification_score_version INTEGER NOT NULL DEFAULT 5,

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

    -- Authenticated evidence attachments (never exposed as public files)
    CREATE TABLE IF NOT EXISTS evidence_attachments (
      id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL REFERENCES evidence(id),
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')),
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      content BLOB NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, evidence_id)
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

    -- Agricultural project assessment (deterministic, explainable rules)
    CREATE TABLE IF NOT EXISTS agricultural_project_assessments (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      crop_code TEXT,
      crop_label TEXT,
      variety TEXT,
      crop_experience_years INTEGER DEFAULT 0,
      completed_campaigns INTEGER DEFAULT 0,
      previous_campaign_result TEXT,
      project_surface_ha REAL DEFAULT 0,
      land_access TEXT,
      agro_zone TEXT,
      soil_type TEXT,
      soil_source TEXT,
      season TEXT,
      sowing_month INTEGER,
      harvest_month INTEGER,
      cultivation_mode TEXT,
      water_source TEXT,
      water_reliability TEXT,
      expected_yield REAL DEFAULT 0,
      expected_price REAL DEFAULT 0,
      loss_percent REAL DEFAULT 0,
      own_contribution INTEGER DEFAULT 0,
      other_funding INTEGER DEFAULT 0,
      market_channel TEXT,
      expected_buyer TEXT,
      climate_risks TEXT DEFAULT '[]',
      mitigations TEXT DEFAULT '[]',
      adequacy_status TEXT,
      viability_status TEXT,
      confidence_level TEXT,
      orientation TEXT,
      calculated_metrics TEXT DEFAULT '{}',
      findings TEXT DEFAULT '[]',
      rules_version INTEGER DEFAULT 1,
      evaluated_at TEXT,
      feasibility_status TEXT,
      feasibility_mode TEXT DEFAULT 'local',
      teranga_yield REAL,
      retained_yield REAL,
      declared_revenue INTEGER,
      retained_revenue INTEGER,
      safety_score REAL,
      risk_level TEXT,
      fallback_reason TEXT,
      feasibility_version INTEGER,
      feasibility_analysis TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(tenant_id, dossier_id)
    );

    -- Detailed agricultural budget/input lines
    CREATE TABLE IF NOT EXISTS agricultural_input_items (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      unit TEXT,
      unit_cost INTEGER DEFAULT 0,
      total_cost INTEGER DEFAULT 0,
      supplier TEXT,
      evidence_id TEXT REFERENCES evidence(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Debts declared by the applicant, kept separate from simulated BIC data
    CREATE TABLE IF NOT EXISTS declared_debts (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      institution TEXT,
      credit_type TEXT,
      source TEXT NOT NULL DEFAULT 'DECLAREE' CHECK(source IN ('DECLAREE','INTERNE','BIC')),
      initial_amount INTEGER DEFAULT 0,
      outstanding INTEGER DEFAULT 0,
      periodic_payment INTEGER DEFAULT 0,
      frequency TEXT DEFAULT 'mensuel',
      start_date TEXT,
      end_date TEXT,
      status TEXT DEFAULT 'en_cours',
      days_late INTEGER DEFAULT 0,
      purpose TEXT,
      reference TEXT,
      evidence_id TEXT REFERENCES evidence(id),
      consent_given INTEGER DEFAULT 0,
      agent_comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Structured guarantors for third-party commitments
    CREATE TABLE IF NOT EXISTS dossier_guarantors (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      full_name TEXT NOT NULL,
      id_number TEXT NOT NULL,
      phone TEXT NOT NULL,
      location TEXT NOT NULL,
      relationship TEXT NOT NULL,
      commitment_type TEXT NOT NULL,
      commitment_amount INTEGER NOT NULL DEFAULT 0,
      consent_given INTEGER NOT NULL DEFAULT 0,
      consent_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
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

    -- Append-only history of committee decisions
    CREATE TABLE IF NOT EXISTS dossier_decision_history (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      decision TEXT NOT NULL CHECK(decision IN ('approved','refused','complement','modified')),
      amount INTEGER,
      duration INTEGER,
      schedule TEXT,
      motif TEXT NOT NULL,
      decided_by TEXT REFERENCES users(id),
      is_override INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Append-only trace of supplements supplied after a complement request
    CREATE TABLE IF NOT EXISTS dossier_complement_history (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL REFERENCES dossiers(id),
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      submitted_by TEXT REFERENCES users(id),
      note TEXT,
      supplied_fields TEXT NOT NULL DEFAULT '[]',
      previous_decision_id TEXT REFERENCES dossier_decision_history(id),
      score_before INTEGER,
      score_after INTEGER,
      score_details TEXT NOT NULL DEFAULT '{}',
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

  await migrateAuditLogSchema(client);

  // Migrations for existing databases
  try { await client.execute('ALTER TABLE dossiers ADD COLUMN prequalification_score INTEGER'); } catch {}
  try { await client.execute("ALTER TABLE dossiers ADD COLUMN prequalification_score_details TEXT NOT NULL DEFAULT '{\"provisional\":true,\"status\":\"INSUFFICIENT_DATA\",\"missing_fields\":[]}'"); } catch {}
  try { await client.execute('ALTER TABLE dossiers ADD COLUMN prequalification_score_version INTEGER NOT NULL DEFAULT 5'); } catch {}
  await client.execute(`UPDATE dossiers SET
    prequalification_score_details = CASE
      WHEN prequalification_score_details IS NULL OR prequalification_score_details = '{}'
        THEN '{"provisional":true,"status":"INSUFFICIENT_DATA","missing_fields":[]}'
      ELSE prequalification_score_details END,
    prequalification_score_version = COALESCE(prequalification_score_version, 5)`);
  try { await client.execute("ALTER TABLE dossiers ADD COLUMN interest_calculation_mode TEXT NOT NULL DEFAULT 'rate'"); } catch {}
  try { await client.execute('ALTER TABLE dossiers ADD COLUMN interest_rate REAL'); } catch {}
  try { await client.execute('ALTER TABLE dossiers ADD COLUMN interest_amount INTEGER NOT NULL DEFAULT 0'); } catch {}
  try { await client.execute('ALTER TABLE dossiers ADD COLUMN total_repayable INTEGER NOT NULL DEFAULT 0'); } catch {}
  await client.execute(`WITH RECURSIVE
    loan_rows(id, principal, duration, annual_rate, declining) AS (
      SELECT id, COALESCE(amount_requested, 0), duration_months, interest_rate,
        CASE WHEN LOWER(COALESCE(desired_schedule, '')) LIKE '%dégressif%'
          OR LOWER(COALESCE(desired_schedule, '')) LIKE '%degressif%'
          OR LOWER(COALESCE(desired_schedule, '')) LIKE '%declining%'
          OR UPPER(COALESCE(desired_schedule, '')) = 'DECLINING' THEN 1 ELSE 0 END
      FROM dossiers
      WHERE COALESCE(interest_rate, 0) > 0 AND COALESCE(duration_months, 0) > 0
    ),
    declining_months(id, month, duration, outstanding, principal_part, remainder, monthly_rate, interest) AS (
      SELECT id, 1, duration, principal, CAST(principal / duration AS INTEGER),
        principal - CAST(principal / duration AS INTEGER) * duration,
        annual_rate / 1200.0, ROUND(principal * annual_rate / 1200.0)
      FROM loan_rows WHERE declining = 1 AND principal > 0 AND duration <= 600
      UNION ALL
      SELECT id, month + 1, duration,
        outstanding - principal_part - CASE WHEN month <= remainder THEN 1 ELSE 0 END,
        principal_part, remainder, monthly_rate,
        ROUND((outstanding - principal_part - CASE WHEN month <= remainder THEN 1 ELSE 0 END) * monthly_rate)
      FROM declining_months WHERE month < duration
    ),
    calculated_interest(id, amount) AS (
      SELECT loans.id, CASE WHEN declining = 1 AND duration <= 600
        THEN COALESCE((SELECT SUM(interest) FROM declining_months WHERE declining_months.id = loans.id), 0)
        ELSE ROUND(principal * annual_rate / 100.0 * duration / 12.0) END
      FROM loan_rows loans
    )
    UPDATE dossiers SET
      interest_calculation_mode = CASE WHEN interest_calculation_mode = 'fixed' THEN 'fixed' ELSE 'rate' END,
      interest_amount = CASE
        WHEN interest_calculation_mode = 'fixed' OR COALESCE(interest_amount, 0) > 0 THEN COALESCE(interest_amount, 0)
        ELSE COALESCE((SELECT amount FROM calculated_interest WHERE calculated_interest.id = dossiers.id), 0) END,
      total_repayable = COALESCE(amount_requested, 0) + CASE
        WHEN interest_calculation_mode = 'fixed' OR COALESCE(interest_amount, 0) > 0 THEN COALESCE(interest_amount, 0)
        ELSE COALESCE((SELECT amount FROM calculated_interest WHERE calculated_interest.id = dossiers.id), 0) END
      WHERE COALESCE(total_repayable, 0) <= 0`);
  await client.execute(`INSERT INTO dossier_decision_history
    (id, dossier_id, tenant_id, decision, amount, duration, schedule, motif, decided_by, is_override, created_at)
    SELECT lower(hex(randomblob(16))), id, tenant_id, decision, decision_amount, decision_duration,
      decision_schedule, COALESCE(decision_motif, 'Décision historique migrée'), decided_by, 0,
      COALESCE(decided_at, updated_at, created_at, datetime('now'))
    FROM dossiers d
    WHERE decision IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM dossier_decision_history h
      WHERE h.dossier_id = d.id AND h.tenant_id = d.tenant_id
    )`);
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_decision_history_tenant_dossier ON dossier_decision_history(tenant_id, dossier_id, created_at)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_complement_history_tenant_dossier ON dossier_complement_history(tenant_id, dossier_id, created_at)'); } catch {}
  const feasibilityColumns = [
    ['feasibility_status', 'TEXT'],
    ['feasibility_mode', "TEXT DEFAULT 'local'"],
    ['teranga_yield', 'REAL'],
    ['retained_yield', 'REAL'],
    ['declared_revenue', 'INTEGER'],
    ['retained_revenue', 'INTEGER'],
    ['safety_score', 'REAL'],
    ['risk_level', 'TEXT'],
    ['fallback_reason', 'TEXT'],
    ['feasibility_version', 'INTEGER'],
    ['feasibility_analysis', "TEXT DEFAULT '{}'"],
  ];
  for (const [column, definition] of feasibilityColumns) {
    try { await client.execute(`ALTER TABLE agricultural_project_assessments ADD COLUMN ${column} ${definition}`); } catch {}
  }
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_agricultural_project_tenant_dossier ON agricultural_project_assessments(tenant_id, dossier_id)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_agricultural_inputs_tenant_dossier ON agricultural_input_items(tenant_id, dossier_id)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_declared_debts_tenant_dossier ON declared_debts(tenant_id, dossier_id)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_dossier_guarantors_tenant_dossier ON dossier_guarantors(tenant_id, dossier_id)'); } catch {}
  try { await client.execute('CREATE INDEX IF NOT EXISTS idx_evidence_attachments_tenant_dossier ON evidence_attachments(tenant_id, dossier_id)'); } catch {}
  try { await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_global ON users(email)'); } catch (e) {
    throw new Error(`Migration unicité globale des emails impossible: ${e.message}`);
  }

  // Migration: add JURY and SUPPORT to role CHECK constraint
  try {
    const tableInfo = await client.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
    const sql = tableInfo.rows[0]?.sql || '';
    if (sql && !sql.includes('JURY')) {
      await client.execute('PRAGMA foreign_keys = OFF');
      await client.execute(`CREATE TABLE IF NOT EXISTS users_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('SUPERADMIN','AGENT','SUPERVISEUR','COMITE','RISK_MANAGER','ADMIN','AUDITEUR','SUPPORT','JURY')),
        phone TEXT,
        agency TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, email),
        UNIQUE(email)
      )`);
      await client.execute('INSERT OR IGNORE INTO users_new SELECT id, tenant_id, email, password_hash, name, role, phone, agency, active, created_at, updated_at FROM users');
      await client.execute('DROP TABLE users');
      await client.execute('ALTER TABLE users_new RENAME TO users');
      await client.execute('PRAGMA foreign_keys = ON');
      console.log('[FresCoop] Migration: rôles JURY/SUPPORT ajoutés');
    }
  } catch (e) { console.log('[FresCoop] Migration roles skipped:', e.message); }

  return client;
}

export function uuid() {
  return randomUUID();
}
