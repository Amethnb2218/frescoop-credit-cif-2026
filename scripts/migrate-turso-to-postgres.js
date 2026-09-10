import { createClient } from '@libsql/client';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;
const DEFAULT_SOURCE_PAGE_SIZE = 250;
const BINARY_SOURCE_PAGE_SIZE = 10;
const DEFAULT_INSERT_BATCH_SIZE = 100;

const required = name => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} est requis`);
  return value;
};

export const TABLES = [
  { name: 'tenants', columns: ['id', 'name', 'code', 'config', 'created_at', 'updated_at'], required: ['id', 'name', 'code'] },
  { name: 'users', columns: ['id', 'tenant_id', 'email', 'password_hash', 'name', 'role', 'phone', 'agency', 'active', 'created_at', 'updated_at'], required: ['id', 'tenant_id', 'email', 'password_hash', 'name', 'role'] },
  { name: 'dossiers', columns: ['id', 'tenant_id', 'local_id', 'agent_id', 'status', 'applicant_name', 'applicant_phone', 'applicant_id_number', 'applicant_location', 'applicant_activity', 'sector', 'activity_type', 'years_experience', 'surface_ha', 'production_cycle', 'amount_requested', 'credit_purpose', 'duration_months', 'desired_schedule', 'savings_amount', 'guarantee_type', 'group_guarantee', 'other_guarantees', 'evidence_confidence', 'repayment_capacity', 'risk_flags', 'prequalification', 'prequalification_reasons', 'prequalification_score', 'prequalification_score_details', 'prequalification_score_version', 'decision', 'decision_amount', 'decision_duration', 'decision_schedule', 'decision_motif', 'decided_by', 'decided_at', 'agent_note', 'sync_status', 'created_offline', 'created_at', 'updated_at'], required: ['id', 'tenant_id', 'agent_id'] },
  { name: 'evidence', columns: ['id', 'dossier_id', 'tenant_id', 'category', 'label', 'value', 'amount', 'unit', 'source', 'source_detail', 'verification_level', 'verified_by', 'verified_at', 'status', 'evidence_date', 'expires_at', 'metadata', 'created_at'] },
  { name: 'evidence_attachments', columns: ['id', 'evidence_id', 'dossier_id', 'tenant_id', 'original_name', 'mime_type', 'size_bytes', 'sha256', 'content', 'created_by', 'created_at', 'updated_at'], binary: ['content'] },
  { name: 'cashflow_entries', columns: ['id', 'dossier_id', 'tenant_id', 'month', 'year', 'revenue', 'revenue_detail', 'expenses', 'expenses_detail', 'debt_payments', 'created_at'], targetOnly: ['net_flow'] },
  { name: 'rules', columns: ['id', 'tenant_id', 'code', 'name', 'description', 'condition_expr', 'result', 'severity', 'active', 'version', 'created_at', 'updated_at'] },
  { name: 'rule_evaluations', columns: ['id', 'dossier_id', 'rule_id', 'tenant_id', 'triggered', 'result', 'explanation', 'data_used', 'evaluated_at'] },
  { name: 'risk_flags', columns: ['id', 'dossier_id', 'tenant_id', 'code', 'label', 'description', 'severity', 'status', 'resolved_by', 'resolved_at', 'resolution_note', 'created_at'] },
  { name: 'bic_records', columns: ['id', 'tenant_id', 'applicant_id_number', 'institution', 'credit_type', 'amount', 'outstanding', 'monthly_payment', 'status', 'start_date', 'end_date', 'days_late', 'is_demo', 'created_at'] },
  { name: 'agricultural_project_assessments', columns: ['id', 'dossier_id', 'tenant_id', 'crop_code', 'crop_label', 'variety', 'crop_experience_years', 'completed_campaigns', 'previous_campaign_result', 'project_surface_ha', 'land_access', 'agro_zone', 'soil_type', 'soil_source', 'season', 'sowing_month', 'harvest_month', 'cultivation_mode', 'water_source', 'water_reliability', 'expected_yield', 'expected_price', 'loss_percent', 'own_contribution', 'other_funding', 'market_channel', 'expected_buyer', 'climate_risks', 'mitigations', 'adequacy_status', 'viability_status', 'confidence_level', 'orientation', 'calculated_metrics', 'findings', 'rules_version', 'evaluated_at', 'feasibility_status', 'feasibility_mode', 'teranga_yield', 'retained_yield', 'declared_revenue', 'retained_revenue', 'safety_score', 'risk_level', 'fallback_reason', 'feasibility_version', 'feasibility_analysis', 'created_at', 'updated_at'] },
  { name: 'agricultural_input_items', columns: ['id', 'dossier_id', 'tenant_id', 'category', 'label', 'quantity', 'unit', 'unit_cost', 'total_cost', 'supplier', 'evidence_id', 'created_at'] },
  { name: 'declared_debts', columns: ['id', 'dossier_id', 'tenant_id', 'institution', 'credit_type', 'source', 'initial_amount', 'outstanding', 'periodic_payment', 'frequency', 'start_date', 'end_date', 'status', 'days_late', 'purpose', 'reference', 'evidence_id', 'consent_given', 'agent_comment', 'created_at', 'updated_at'] },
  { name: 'dossier_guarantors', columns: ['id', 'dossier_id', 'tenant_id', 'full_name', 'id_number', 'phone', 'location', 'relationship', 'commitment_type', 'commitment_amount', 'consent_given', 'consent_date', 'created_at', 'updated_at'] },
  { name: 'stress_tests', columns: ['id', 'dossier_id', 'tenant_id', 'scenario', 'revenue_adjustment', 'description', 'can_repay', 'monthly_capacity', 'margin_percent', 'recommendation', 'computed_at'] },
  { name: 'audit_log', columns: ['id', 'tenant_id', 'user_id', 'user_name', 'user_role', 'action', 'entity_type', 'entity_id', 'details', 'old_value', 'new_value', 'ip_address', 'created_at'] },
  { name: 'credit_products', columns: ['id', 'tenant_id', 'code', 'name', 'min_amount', 'max_amount', 'min_duration', 'max_duration', 'max_rate', 'eligible_sectors', 'active', 'created_at', 'updated_at'] },
  { name: 'field_visits', columns: ['id', 'dossier_id', 'tenant_id', 'agent_id', 'visit_date', 'gps_lat', 'gps_lon', 'observations', 'photos_count', 'activity_confirmed', 'created_at'] },
  { name: 'consent_records', columns: ['id', 'dossier_id', 'tenant_id', 'applicant_name', 'consent_type', 'consent_given', 'consent_date', 'consent_method', 'witness', 'created_at'] },
  { name: 'fraud_checks', columns: ['id', 'dossier_id', 'tenant_id', 'check_type', 'result', 'details', 'severity', 'created_at'] },
  { name: 'sync_queue', columns: ['id', 'tenant_id', 'user_id', 'operation', 'entity_type', 'entity_id', 'payload', 'local_timestamp', 'server_timestamp', 'status', 'retry_count', 'error', 'created_at'] },
];

export const ORPHAN_CHECKS = [
  ['users.tenant_id', 'users u LEFT JOIN tenants t ON t.id = u.tenant_id', 't.id IS NULL'],
  ['dossiers.tenant_id', 'dossiers d LEFT JOIN tenants t ON t.id = d.tenant_id', 't.id IS NULL'],
  ['dossiers.agent_id', 'dossiers d LEFT JOIN users u ON u.id = d.agent_id', 'u.id IS NULL'],
  ['evidence.dossier_id', 'evidence e LEFT JOIN dossiers d ON d.id = e.dossier_id', 'd.id IS NULL'],
  ['evidence_attachments.evidence_id', 'evidence_attachments a LEFT JOIN evidence e ON e.id = a.evidence_id', 'e.id IS NULL'],
  ['cashflow_entries.dossier_id', 'cashflow_entries c LEFT JOIN dossiers d ON d.id = c.dossier_id', 'd.id IS NULL'],
  ['rule_evaluations.rule_id', 'rule_evaluations e LEFT JOIN rules r ON r.id = e.rule_id', 'r.id IS NULL'],
  ['agricultural_input_items.evidence_id', 'agricultural_input_items i LEFT JOIN evidence e ON e.id = i.evidence_id', 'i.evidence_id IS NOT NULL AND e.id IS NULL'],
  ['field_visits.agent_id', 'field_visits v LEFT JOIN users u ON u.id = v.agent_id', 'u.id IS NULL'],
];

export function toBuffer(value) {
  if (value == null || Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (value instanceof Uint8Array || Array.isArray(value)) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'base64');
  throw new Error(`Format binaire source non pris en charge: ${typeof value}`);
}

function positiveInteger(value, fallback, name) {
  if (value == null) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} doit être un entier positif`);
  return parsed;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function rowHasColumn(row, column) {
  return Object.prototype.hasOwnProperty.call(row, column);
}

async function readSourceTableDefinition(source, table) {
  const exists = await source.execute({
    sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [table.name],
  });
  if (exists.rows.length === 0) return null;

  const sourceColumns = await source.execute(`PRAGMA table_info(${quoteIdentifier(table.name)})`);
  const available = new Set(sourceColumns.rows.map(row => row.name));
  const selected = table.columns.filter(column => available.has(column));
  const missing = table.columns.filter(column => !available.has(column));
  const required = table.required || ['id', 'tenant_id'];
  const omittedRequired = required.filter(column => !available.has(column));
  if (omittedRequired.length > 0) {
    throw new Error(`Colonnes requises absentes de ${table.name}: ${omittedRequired.join(', ')}`);
  }
  return { selected, missing };
}

async function validateTargetSchema(target) {
  const schema = await target.query("SELECT to_regclass('public.schema_migrations') AS table_name");
  if (!schema.rows[0]?.table_name) throw new Error('Le schéma PostgreSQL doit être migré avant le transfert');

  for (const table of TABLES) {
    const result = await target.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table.name],
    );
    const targetColumns = new Set(result.rows.map(row => row.column_name));
    const missing = [...table.columns, ...(table.targetOnly || [])].filter(column => !targetColumns.has(column));
    if (missing.length > 0) throw new Error(`Colonnes PostgreSQL absentes de ${table.name}: ${missing.join(', ')}`);
  }
}

async function assertTargetEmpty(target) {
  for (const table of TABLES) {
    const result = await target.query(`SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(table.name)}`);
    if (result.rows[0].count !== 0) throw new Error(`La table cible ${table.name} n'est pas vide`);
  }
}

async function countSourceRows(source, table, definition) {
  if (!definition) return 0;
  const result = await source.execute(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.name)}`);
  return Number(result.rows[0].count);
}

async function readSourcePage(source, table, definition, limit, offset) {
  const columns = definition.selected.map(quoteIdentifier).join(', ');
  const result = await source.execute({
    sql: `SELECT ${columns} FROM ${quoteIdentifier(table.name)} LIMIT ? OFFSET ?`,
    args: [limit, offset],
  });
  return result.rows;
}

function buildInsert(table, rows) {
  const columns = table.columns.filter(column => rows.some(row => rowHasColumn(row, column)));
  const values = [];
  const tuples = rows.map(row => {
    const placeholders = columns.map(column => {
      values.push(rowHasColumn(row, column)
        ? (table.binary?.includes(column) ? toBuffer(row[column]) : row[column])
        : null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  return {
    sql: `INSERT INTO ${quoteIdentifier(table.name)} (${columns.map(quoteIdentifier).join(', ')}) VALUES ${tuples.join(', ')}`,
    values,
  };
}

async function insertRows(target, table, rows, batchSize) {
  for (const group of rows.reduce((groups, row) => {
    const columns = table.columns.filter(column => rowHasColumn(row, column));
    const key = JSON.stringify(columns);
    const existing = groups.find(item => item.key === key);
    if (existing) existing.rows.push(row);
    else groups.push({ key, columns, rows: [row] });
    return groups;
  }, [])) {
    const rowWidth = Math.max(group.columns.length, 1);
    const effectiveBatchSize = Math.min(batchSize, Math.max(1, Math.floor(65535 / rowWidth)));
    for (let index = 0; index < group.rows.length; index += effectiveBatchSize) {
      const batch = group.rows.slice(index, index + effectiveBatchSize);
      const { sql, values } = buildInsert(table, batch);
      await target.query(sql, values);
    }
  }
}

async function migrateTable({ source, target, table, definition, count, sourcePageSize, insertBatchSize }) {
  if (!definition || count === 0) return;
  const pageSize = table.binary ? Math.min(sourcePageSize, BINARY_SOURCE_PAGE_SIZE) : sourcePageSize;
  for (let offset = 0; offset < count; offset += pageSize) {
    const rows = await readSourcePage(source, table, definition, pageSize, offset);
    if (rows.length === 0) throw new Error(`Lecture source incomplète pour ${table.name} à partir de ${offset}`);
    await insertRows(target, table, rows, insertBatchSize);
  }
}

async function validateCountsAndRelations(target, counts) {
  for (const table of TABLES) {
    const result = await target.query(`SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(table.name)}`);
    if (result.rows[0].count !== counts[table.name]) throw new Error(`Nombre de lignes différent pour ${table.name}`);
  }
  for (const [relation, joins, condition] of ORPHAN_CHECKS) {
    const result = await target.query(`SELECT COUNT(*)::integer AS count FROM ${joins} WHERE ${condition}`);
    if (result.rows[0].count !== 0) throw new Error(`Références orphelines détectées: ${relation}`);
  }
}

export async function migrateTursoToPostgres({
  sourceUrl,
  sourceAuthToken,
  targetUrl,
  apply = false,
  sourceClient,
  targetClient,
  sourcePageSize,
  insertBatchSize,
}) {
  const source = sourceClient || createClient({ url: sourceUrl, authToken: sourceAuthToken });
  const target = targetClient || new Client({ connectionString: targetUrl });
  const closeSource = !sourceClient;
  const closeTarget = !targetClient;
  const pageSize = positiveInteger(sourcePageSize, DEFAULT_SOURCE_PAGE_SIZE, 'sourcePageSize');
  const batchSize = positiveInteger(insertBatchSize, DEFAULT_INSERT_BATCH_SIZE, 'insertBatchSize');
  const definitions = new Map();
  const counts = {};

  try {
    if (typeof target.connect === 'function') await target.connect();
    await validateTargetSchema(target);
    await assertTargetEmpty(target);

    for (const table of TABLES) {
      const definition = await readSourceTableDefinition(source, table);
      definitions.set(table.name, definition);
      if (!definition) {
        console.log(`- ${table.name}: table absente de l'ancien schéma, traitée comme vide`);
      } else if (definition.missing.length > 0) {
        console.log(`- ${table.name}: colonnes récentes absentes ignorées (${definition.missing.join(', ')})`);
      }
      counts[table.name] = await countSourceRows(source, table, definition);
    }

    console.log(apply
      ? '[FresCoop] Mode APPLY: transfert transactionnel demandé'
      : '[FresCoop] Mode DRY-RUN: validation transactionnelle avec annulation');
    for (const table of TABLES) console.log(`- ${table.name}: ${counts[table.name]} ligne(s) source`);

    await target.query('BEGIN');
    try {
      for (const table of TABLES) {
        await migrateTable({
          source,
          target,
          table,
          definition: definitions.get(table.name),
          count: counts[table.name],
          sourcePageSize: pageSize,
          insertBatchSize: batchSize,
        });
      }
      await validateCountsAndRelations(target, counts);
      if (apply) {
        await target.query('COMMIT');
        console.log('[FresCoop] Transfert validé et terminé. Turso est resté inchangé.');
      } else {
        await target.query('ROLLBACK');
        console.log('[FresCoop] Contrôle à blanc validé et annulé. Relancer avec --apply après sauvegarde et gel des écritures.');
      }
      return { applied: apply, counts };
    } catch (error) {
      await target.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    if (closeSource) source.close();
    if (closeTarget) await target.end().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrateTursoToPostgres({
    sourceUrl: required('TURSO_SOURCE_DATABASE_URL'),
    sourceAuthToken: required('TURSO_SOURCE_AUTH_TOKEN'),
    targetUrl: required('DATABASE_URL'),
    apply: process.argv.includes('--apply'),
  }).catch(error => {
    console.error(`[FresCoop] Transfert interrompu: ${error.message}`);
    process.exitCode = 1;
  });
}
