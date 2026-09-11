import { getDb } from './db.js';
import { assessAgriculturalProject } from './services/agriculturalAssessment.js';
import {
  agriculturalAssessmentStatement,
  agriculturalFeasibilityRecord,
} from './services/agriculturalFeasibilityPersistence.js';
import { buildFinancialCashflow } from './services/financialCashflow.js';
import { evaluateDossier, SCORE_VERSION } from './services/prequalification.js';

const SEED_VERSION = 1;
const FIXED_EVALUATION_DATE = '2026-08-01T00:00:00.000Z';
const FIXED_YEAR = 2026;
const PROFILE_KEYS = ['solide', 'intermediaire', 'saisonnier', 'stress'];

export const DEMO_DOSSIER_IDS = Object.freeze(
  PROFILE_KEYS.map(key => `demo-${key}`),
);

const PROFILES = [
  {
    key: 'solide',
    expected: {
      score: 84,
      prequalification: 'PREQUALIFIE',
      capacity: 'SUFFICIENT',
      feasibility: 'FEASIBLE',
      triggered: [],
    },
    dossier: {
      status: 'review', applicant_name: 'Profil démo solide', applicant_id_number: 'DEMO-SOLIDE-2026',
      applicant_location: 'Saint-Louis', applicant_activity: 'Riziculture irriguée', sector: 'Agriculture',
      activity_type: 'Grandes cultures', years_experience: 9, surface_ha: 2,
      production_cycle: 'Campagne 2026', amount_requested: 1000000,
      credit_purpose: 'Intrants de campagne', duration_months: 12, desired_schedule: 'Mensuel',
      savings_amount: 300000, guarantee_type: 'Épargne',
      agent_note: 'Données synthétiques FresCoop — profil solide.',
    },
    project: {
      crop_code: 'RICE', crop_label: 'Riz', crop_experience_years: 9, completed_campaigns: 7,
      previous_campaign_result: 'bénéficiaire', project_surface_ha: 2, land_access: 'bail',
      agro_zone: 'Saint-Louis', soil_type: 'Argileux', soil_source: 'analyse documentée',
      season: 'saison sèche', sowing_month: 6, harvest_month: 10,
      cultivation_mode: 'irrigué', water_source: 'Canal', water_reliability: 'élevée',
      expected_yield: 4000, expected_price: 250, loss_percent: 5,
      own_contribution: 300000, other_funding: 0, market_channel: 'coopérative',
      expected_buyer: 'Acheteur synthétique', climate_risks: ['sécheresse'], mitigations: ['irrigation'],
    },
    inputs: [{ category: 'intrants', label: 'Intrants rizicoles', quantity: 1, unit: 'lot', unit_cost: 1300000 }],
    evidence: [
      { category: 'foncier', label: 'Accès parcelle synthétique', source: 'déclaration démo', verification_level: 'C' },
      { category: 'vente', label: 'Historique de vente synthétique', source: 'déclaration démo', verification_level: 'D' },
      { category: 'épargne', label: 'Épargne déclarée synthétique', source: 'déclaration démo', verification_level: 'D' },
    ],
    debts: [],
    financial: { commerce_revenue: 100000, commerce_revenue_frequency: 'mensuel', other_revenue: 0,
      other_revenue_frequency: 'mensuel', agricultural_expenses: 20000, household_expenses: 40000 },
  },
  {
    key: 'intermediaire',
    expected: {
      score: 50,
      prequalification: 'REVUE_REQUISE',
      capacity: 'LIMIT',
      feasibility: 'FEASIBLE',
      triggered: ['RULE-CAP-002', 'RULE-EV-001', 'RULE-SEAS-001'],
    },
    dossier: {
      status: 'verification', applicant_name: 'Profil démo intermédiaire', applicant_id_number: 'DEMO-INTER-2026',
      applicant_location: 'Kaolack', applicant_activity: 'Culture d’arachide', sector: 'Agriculture',
      activity_type: 'Arachide', years_experience: 4, surface_ha: 2,
      production_cycle: 'Hivernage 2026', amount_requested: 294000,
      credit_purpose: 'Semences et engrais', duration_months: 12, desired_schedule: 'Mensuel',
      savings_amount: 60000, guarantee_type: 'Épargne',
      agent_note: 'Données synthétiques FresCoop — profil intermédiaire.',
    },
    project: {
      crop_code: 'PEANUT', crop_label: 'Arachide', crop_experience_years: 4, completed_campaigns: 3,
      previous_campaign_result: 'équilibré', project_surface_ha: 2, land_access: 'familial',
      agro_zone: 'Kaolack', soil_type: 'Sableux', soil_source: 'observation terrain',
      season: 'hivernage', sowing_month: 7, harvest_month: 11,
      cultivation_mode: 'pluvial', expected_yield: 1100, expected_price: 300, loss_percent: 10,
      own_contribution: 60000, other_funding: 0, market_channel: 'marché local',
      expected_buyer: 'Acheteur synthétique', climate_risks: ['pluviométrie'], mitigations: ['semis adapté'],
    },
    inputs: [{ category: 'intrants', label: 'Intrants arachide', quantity: 1, unit: 'lot', unit_cost: 420000 }],
    evidence: [
      { category: 'visite', label: 'Visite synthétique', source: 'déclaration démo', verification_level: 'D' },
    ],
    debts: [],
    financial: { commerce_revenue: 0, commerce_revenue_frequency: 'mensuel', other_revenue: 0,
      other_revenue_frequency: 'mensuel', agricultural_expenses: 10000, household_expenses: 14000 },
  },
  {
    key: 'saisonnier',
    expected: {
      score: 93,
      prequalification: 'REVUE_REQUISE',
      capacity: 'SUFFICIENT',
      feasibility: 'FEASIBLE',
      triggered: ['RULE-SEAS-001'],
    },
    dossier: {
      status: 'review', applicant_name: 'Profil démo saisonnier', applicant_id_number: 'DEMO-SAISON-2026',
      applicant_location: 'Thiès', applicant_activity: 'Maraîchage', sector: 'Agriculture',
      activity_type: 'Maraîchage', years_experience: 7, surface_ha: 1.5,
      production_cycle: 'Octobre–mars', amount_requested: 500000,
      credit_purpose: 'Campagne maraîchère', duration_months: 10, desired_schedule: 'Saisonnier',
      savings_amount: 150000, guarantee_type: 'Nantissement récolte',
      agent_note: 'Données synthétiques FresCoop — profil saisonnier.',
    },
    project: {
      crop_code: 'TOMATO', crop_label: 'Tomate', crop_experience_years: 7, completed_campaigns: 6,
      previous_campaign_result: 'bénéficiaire', project_surface_ha: 1.5, land_access: 'propriété',
      agro_zone: 'Thiès', soil_type: 'Limoneux', soil_source: 'analyse documentée',
      season: 'saison sèche', sowing_month: 10, harvest_month: 3,
      cultivation_mode: 'irrigué', water_source: 'Forage', water_reliability: 'élevée',
      expected_yield: 7000, expected_price: 220, loss_percent: 10,
      own_contribution: 150000, other_funding: 0, market_channel: 'coopérative',
      expected_buyer: 'Acheteur synthétique', climate_risks: ['chaleur'], mitigations: ['irrigation'],
    },
    inputs: [{ category: 'intrants', label: 'Intrants maraîchers', quantity: 1, unit: 'lot', unit_cost: 650000 }],
    evidence: [
      { category: 'identité', label: 'Identité synthétique', source: 'registre démo', verification_level: 'A' },
      { category: 'livraison', label: 'Livraison synthétique', source: 'registre démo', verification_level: 'A' },
      { category: 'foncier', label: 'Parcelle synthétique', source: 'registre démo', verification_level: 'B' },
    ],
    debts: [],
    financial: { commerce_revenue: 0, commerce_revenue_frequency: 'mensuel', other_revenue: 0,
      other_revenue_frequency: 'mensuel', agricultural_expenses: 25000, household_expenses: 25000 },
  },
  {
    key: 'stress',
    expected: {
      score: 20,
      prequalification: 'NON_ELIGIBLE',
      capacity: 'INSUFFICIENT',
      feasibility: 'HUMAN_REVIEW',
      triggered: ['RULE-AMT-001', 'RULE-CAP-001', 'RULE-CAP-002', 'RULE-EV-001', 'RULE-SEAS-001'],
    },
    dossier: {
      status: 'review_required', applicant_name: 'Profil démo sous stress', applicant_id_number: 'DEMO-STRESS-2026',
      applicant_location: 'Louga', applicant_activity: 'Horticulture irriguée', sector: 'Agriculture',
      activity_type: 'Horticulture', years_experience: 2, surface_ha: 1,
      production_cycle: 'Campagne 2026', amount_requested: 900000,
      credit_purpose: 'Équipement et intrants', duration_months: 12, desired_schedule: 'Mensuel',
      savings_amount: 20000, guarantee_type: 'Épargne',
      agent_note: 'Données synthétiques FresCoop — décision humaine obligatoire.',
    },
    project: {
      crop_code: 'ONION', crop_label: 'Oignon', crop_experience_years: 2, completed_campaigns: 1,
      previous_campaign_result: 'fragile', project_surface_ha: 1, previous_surface_ha: 0.5,
      land_access: 'prêt', agro_zone: 'Louga', soil_type: 'Sableux', soil_source: 'déclaration',
      season: 'saison sèche', sowing_month: 10, harvest_month: 2,
      cultivation_mode: 'irrigué', water_source: '', water_reliability: 'faible',
      expected_yield: 2500, expected_price: 180, loss_percent: 20,
      own_contribution: 20000, other_funding: 0, market_channel: 'marché local',
      expected_buyer: 'Non contractualisé', climate_risks: ['sécheresse'], mitigations: [],
    },
    inputs: [{ category: 'intrants', label: 'Intrants horticoles', quantity: 1, unit: 'lot', unit_cost: 700000 }],
    evidence: [
      { category: 'projet', label: 'Déclaration synthétique', source: 'déclaration démo', verification_level: 'D' },
    ],
    debts: [{ institution: 'IMF synthétique', credit_type: 'campagne', source: 'DECLAREE',
      initial_amount: 500000, outstanding: 400000, periodic_payment: 40000, frequency: 'mensuel',
      status: 'en_cours', days_late: 0, consent_given: true }],
    financial: { commerce_revenue: 0, commerce_revenue_frequency: 'mensuel', other_revenue: 0,
      other_revenue_frequency: 'mensuel', agricultural_expenses: 20000, household_expenses: 30000 },
  },
];

function isEnabled(env) {
  return env.FRESCOOP_DEMO_SEED_ENABLED === 'true';
}

function assertConfiguration(env) {
  if (!env.FRESCOOP_DEMO_TENANT_CODE || !env.FRESCOOP_DEMO_AGENT_EMAIL) {
    throw new Error('Seed démo FresCoop: tenant et agent explicites requis');
  }
  if (env.NODE_ENV === 'production'
    && env.FRESCOOP_DEMO_SEED_PRODUCTION_ACK !== 'FRESCOOP_DEMO_DATA') {
    throw new Error('Seed démo FresCoop: confirmation de production manquante');
  }
}

function stableId(profileKey, entity, index = null) {
  return `demo-${profileKey}-${entity}${index == null ? '' : `-${index + 1}`}`;
}

function normalizeProfile(profile) {
  const dossierId = `demo-${profile.key}`;
  return {
    ...profile,
    dossierId,
    inputs: profile.inputs.map((item, index) => ({ ...item, id: stableId(profile.key, 'input', index) })),
    evidence: profile.evidence.map((item, index) => ({ ...item, id: stableId(profile.key, 'evidence', index) })),
    debts: profile.debts.map((debt, index) => ({ ...debt, id: stableId(profile.key, 'debt', index) })),
  };
}

async function resolveTarget(db, env) {
  const tenant = await db.execute({
    sql: 'SELECT id FROM tenants WHERE code = ?',
    args: [env.FRESCOOP_DEMO_TENANT_CODE],
  });
  if (tenant.rows.length !== 1) throw new Error('Seed démo FresCoop: tenant introuvable ou ambigu');
  const tenantId = tenant.rows[0].id;
  const agent = await db.execute({
    sql: 'SELECT id, active FROM users WHERE tenant_id = ? AND email = ?',
    args: [tenantId, env.FRESCOOP_DEMO_AGENT_EMAIL],
  });
  if (agent.rows.length !== 1 || Number(agent.rows[0].active) !== 1) {
    throw new Error('Seed démo FresCoop: agent actif introuvable ou ambigu');
  }
  return { tenantId, agentId: agent.rows[0].id };
}

function assertManifestRow(row, expected, label) {
  if (!row) {
    throw new Error(`Seed démo FresCoop: manifeste incomplet pour ${label}`);
  }
  for (const [field, value] of Object.entries(expected)) {
    if (row[field] !== value) {
      throw new Error(`Seed démo FresCoop: dérive détectée pour ${label}.${field}`);
    }
  }
}

function assertManifestCollection(rows, expectedRows, fields, label) {
  const actual = new Map(rows.map(row => [row.id, row]));
  const expected = new Map(expectedRows.map(row => [row.id, row]));
  if (actual.size !== expected.size || [...actual.keys()].some(id => !expected.has(id))) {
    throw new Error(`Seed démo FresCoop: manifeste incomplet pour ${label}`);
  }
  for (const [id, expectedRow] of expected) {
    assertManifestRow(actual.get(id), Object.fromEntries(
      fields.map(field => [field, expectedRow[field]]),
    ), `${label}.${id}`);
  }
}

function expectedProfileData(rawProfile) {
  const profile = normalizeProfile(rawProfile);
  const local = assessAgriculturalProject(profile.project, profile.inputs, profile.evidence);
  const analysis = localAnalysis(local, profile.project);
  const feasibility = agriculturalFeasibilityRecord(analysis);
  const cashflow = buildFinancialCashflow(profile.financial, {
    ...profile.project,
    retained_revenue: feasibility.retained_revenue,
    declared_revenue: feasibility.declared_revenue,
    revenue_adjustment: analysis.details.metrics.revenue_adjustment,
  }, profile.debts, FIXED_YEAR).map((entry, index) => ({
    ...entry,
    id: stableId(profile.key, 'cashflow', index),
  }));
  return { profile, feasibility, cashflow };
}

async function inspectExisting(db, tenantId, agentId) {
  const placeholders = DEMO_DOSSIER_IDS.map(() => '?').join(', ');
  const dossiers = await db.execute({
    sql: `SELECT id, tenant_id, agent_id, local_id, applicant_id_number, applicant_name,
                 prequalification, repayment_capacity, prequalification_score,
                 prequalification_score_version, created_at, updated_at
          FROM dossiers WHERE id IN (${placeholders})`,
    args: DEMO_DOSSIER_IDS,
  });
  const found = new Map(dossiers.rows.map(row => [row.id, row]));
  if (found.size === 0) return 'create';
  if (found.size !== DEMO_DOSSIER_IDS.length) {
    throw new Error('Seed démo FresCoop: collision, dérive ou lot partiel détecté');
  }
  for (const rawProfile of PROFILES) {
    const { profile, feasibility, cashflow } = expectedProfileData(rawProfile);
    assertManifestRow(found.get(profile.dossierId), {
      tenant_id: tenantId,
      agent_id: agentId,
      local_id: profile.dossierId,
      applicant_id_number: profile.dossier.applicant_id_number,
      applicant_name: profile.dossier.applicant_name,
      prequalification: profile.expected.prequalification,
      repayment_capacity: profile.expected.capacity,
      prequalification_score: profile.expected.score,
      prequalification_score_version: SCORE_VERSION,
      created_at: FIXED_EVALUATION_DATE,
      updated_at: FIXED_EVALUATION_DATE,
    }, profile.dossierId);

    const [projects, inputs, evidence, debts, cashflowRows, evaluations] = await Promise.all([
      db.execute({
        sql: `SELECT id, feasibility_status, feasibility_mode, teranga_yield,
                     retained_yield, retained_revenue, feasibility_version
              FROM agricultural_project_assessments
              WHERE dossier_id = ? AND tenant_id = ?`,
        args: [profile.dossierId, tenantId],
      }),
      db.execute({
        sql: `SELECT id, category, label, quantity, unit, unit_cost, total_cost
              FROM agricultural_input_items WHERE dossier_id = ? AND tenant_id = ?`,
        args: [profile.dossierId, tenantId],
      }),
      db.execute({
        sql: `SELECT id, category, label, source, verification_level
              FROM evidence WHERE dossier_id = ? AND tenant_id = ?`,
        args: [profile.dossierId, tenantId],
      }),
      db.execute({
        sql: `SELECT id, institution, credit_type, source, initial_amount, outstanding,
                     periodic_payment, frequency, status, days_late, consent_given
              FROM declared_debts WHERE dossier_id = ? AND tenant_id = ?`,
        args: [profile.dossierId, tenantId],
      }),
      db.execute({
        sql: `SELECT id, month, year, revenue, expenses, debt_payments
              FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ?`,
        args: [profile.dossierId, tenantId],
      }),
      db.execute({
        sql: `SELECT r.code FROM rule_evaluations re
              JOIN rules r ON r.id = re.rule_id
              WHERE re.dossier_id = ? AND re.tenant_id = ? AND re.triggered = 1
              ORDER BY r.code`,
        args: [profile.dossierId, tenantId],
      }),
    ]);

    if (projects.rows.length !== 1) {
      throw new Error(`Seed démo FresCoop: dérive détectée pour ${profile.dossierId}.projet`);
    }
    assertManifestRow(projects.rows[0], {
      id: stableId(profile.key, 'project'),
      feasibility_status: profile.expected.feasibility,
      feasibility_mode: 'local',
      teranga_yield: null,
      retained_yield: feasibility.retained_yield,
      retained_revenue: feasibility.retained_revenue,
      feasibility_version: 3,
    }, `${profile.dossierId}.projet`);
    assertManifestCollection(inputs.rows, profile.inputs.map(item => ({
      ...item,
      total_cost: Math.round(item.quantity * item.unit_cost),
    })), ['category', 'label', 'quantity', 'unit', 'unit_cost', 'total_cost'], `${profile.dossierId}.intrants`);
    assertManifestCollection(evidence.rows, profile.evidence,
      ['category', 'label', 'source', 'verification_level'], `${profile.dossierId}.preuves`);
    assertManifestCollection(debts.rows, profile.debts.map(debt => ({
      ...debt,
      consent_given: debt.consent_given ? 1 : 0,
    })), ['institution', 'credit_type', 'source', 'initial_amount', 'outstanding',
      'periodic_payment', 'frequency', 'status', 'days_late', 'consent_given'], `${profile.dossierId}.dettes`);
    assertManifestCollection(cashflowRows.rows, cashflow,
      ['month', 'year', 'revenue', 'expenses', 'debt_payments'], `${profile.dossierId}.cashflow`);
    const triggered = evaluations.rows.map(row => row.code);
    if (JSON.stringify(triggered) !== JSON.stringify([...profile.expected.triggered].sort())) {
      throw new Error(`Seed démo FresCoop: dérive détectée pour ${profile.dossierId}.règles`);
    }
  }
  return 'existing';
}

function localAnalysis(local, project) {
  const result = {
    status: local.adequacy_status === 'INCOMPATIBLE' || local.viability_status === 'NON_VIABLE'
      ? 'HUMAN_REVIEW'
      : local.findings.length || local.missing_data.length ? 'ADJUST' : 'FEASIBLE',
    label: 'Évaluation locale FresCoop',
    summary: 'Résultat déterministe calculé sans service externe.',
    report: 'Rapport démo calculé localement par FresCoop.',
    details: {
      missing_data: local.missing_data,
      findings: local.findings,
      recommendations: local.findings.map(item => item.action).filter(Boolean),
      external_signals: [],
      metrics: {
        ...local.metrics,
        declared_yield: project.expected_yield,
        teranga_yield: null,
        retained_yield: project.expected_yield,
        declared_revenue: local.metrics.expected_revenue,
        retained_revenue: local.metrics.expected_revenue,
        revenue_adjustment: 0,
        external_adjustment_applied: false,
      },
      risk: { safety_score: null, level: null, recommendation: null },
      caveats: [],
    },
    source: {
      mode: 'local', contract_version: 3, engine: 'frescoop-agronomic-feasibility',
      engine_version: 3, local_rules_version: local.rules_version,
      teranga: { attempted: false, available: false },
      fallback_used: false, fallback_reason: 'not_configured',
    },
    evaluated_at: FIXED_EVALUATION_DATE,
  };
  result.calculated_metrics = result.details.metrics;
  return result;
}

function dossierStatement(profile, tenantId, agentId) {
  const dossier = profile.dossier;
  return {
    sql: `INSERT INTO dossiers (id, tenant_id, local_id, agent_id, status,
      applicant_name, applicant_phone, applicant_id_number, applicant_location, applicant_activity,
      sector, activity_type, years_experience, surface_ha, production_cycle, amount_requested,
      credit_purpose, duration_months, desired_schedule, savings_amount, guarantee_type, agent_note,
      created_offline, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    args: [profile.dossierId, tenantId, profile.dossierId, agentId, dossier.status,
      dossier.applicant_name, dossier.applicant_id_number, dossier.applicant_location,
      dossier.applicant_activity, dossier.sector, dossier.activity_type, dossier.years_experience,
      dossier.surface_ha, dossier.production_cycle, dossier.amount_requested, dossier.credit_purpose,
      dossier.duration_months, dossier.desired_schedule, dossier.savings_amount, dossier.guarantee_type,
      dossier.agent_note, FIXED_EVALUATION_DATE, FIXED_EVALUATION_DATE],
  };
}

function childStatements(profile, tenantId, local, analysis) {
  const feasibility = agriculturalFeasibilityRecord(analysis);
  const statements = [agriculturalAssessmentStatement({
    dossierId: profile.dossierId,
    tenantId,
    project: profile.project,
    local,
    analysis,
    feasibility,
    id: stableId(profile.key, 'project'),
  })];
  profile.inputs.forEach(item => statements.push({
    sql: `INSERT INTO agricultural_input_items
      (id, dossier_id, tenant_id, category, label, quantity, unit, unit_cost, total_cost, supplier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    args: [item.id, profile.dossierId, tenantId, item.category, item.label,
      item.quantity, item.unit, item.unit_cost, Math.round(item.quantity * item.unit_cost)],
  }));
  profile.evidence.forEach(item => statements.push({
    sql: `INSERT INTO evidence (id, dossier_id, tenant_id, category, label, source,
      verification_level, status, evidence_date, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', '2026-07-01', ?, ?)`,
    args: [item.id, profile.dossierId, tenantId, item.category, item.label, item.source,
      item.verification_level, JSON.stringify({ demo: true, seed_version: SEED_VERSION }), FIXED_EVALUATION_DATE],
  }));
  profile.debts.forEach(debt => statements.push({
    sql: `INSERT INTO declared_debts (id, dossier_id, tenant_id, institution, credit_type, source,
      initial_amount, outstanding, periodic_payment, frequency, status, days_late, consent_given,
      created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [debt.id, profile.dossierId, tenantId, debt.institution, debt.credit_type, debt.source,
      debt.initial_amount, debt.outstanding, debt.periodic_payment, debt.frequency, debt.status,
      debt.days_late, debt.consent_given ? 1 : 0, FIXED_EVALUATION_DATE, FIXED_EVALUATION_DATE],
  }));
  const cashflow = buildFinancialCashflow({
    ...profile.financial,
  }, {
    ...profile.project,
    retained_revenue: feasibility.retained_revenue,
    declared_revenue: feasibility.declared_revenue,
    revenue_adjustment: analysis.details.metrics.revenue_adjustment,
  }, profile.debts, FIXED_YEAR);
  cashflow.forEach((entry, index) => statements.push({
    sql: `INSERT INTO cashflow_entries
      (id, dossier_id, tenant_id, month, year, revenue, revenue_detail, expenses,
       expenses_detail, debt_payments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [stableId(profile.key, 'cashflow', index), profile.dossierId, tenantId, entry.month,
      entry.year, entry.revenue, JSON.stringify(entry.revenue_detail), entry.expenses,
      JSON.stringify(entry.expenses_detail), entry.debt_payments, FIXED_EVALUATION_DATE],
  }));
  return statements;
}

async function createProfiles(transaction, tenantId, agentId, hooks) {
  for (const rawProfile of PROFILES) {
    const profile = normalizeProfile(rawProfile);
    const local = assessAgriculturalProject(profile.project, profile.inputs, profile.evidence);
    const analysis = localAnalysis(local, profile.project);
    await transaction.batch([
      dossierStatement(profile, tenantId, agentId),
      ...childStatements(profile, tenantId, local, analysis),
    ]);
    if (hooks.afterProfile) await hooks.afterProfile(profile.key);
  }
}

function assertProfileResult(profile, result) {
  const triggered = result.evaluations.filter(item => item.triggered).map(item => item.rule_code).sort();
  const feasibility = result.details.agronomic_impact.status;
  if (result.score !== profile.expected.score
    || result.prequalification !== profile.expected.prequalification
    || result.repaymentCapacity !== profile.expected.capacity
    || feasibility !== profile.expected.feasibility
    || JSON.stringify(triggered) !== JSON.stringify([...profile.expected.triggered].sort())) {
    throw new Error(`Seed démo FresCoop: résultat inattendu pour ${profile.dossierId} (${JSON.stringify({
      score: result.score,
      prequalification: result.prequalification,
      capacity: result.repaymentCapacity,
      capacityRatio: result.details.capacity_ratio,
      stressedCapacityRatio: result.details.stressed_capacity_ratio,
      feasibility,
      components: result.details.components,
      totalRevenue: result.context.totalRevenue,
      totalExpenses: result.context.totalExpenses,
      triggered,
    })})`);
  }
}

export async function seedDemoDossiers({
  db = getDb(),
  env = process.env,
  hooks = {},
} = {}) {
  if (!isEnabled(env)) return { enabled: false, created: 0, existing: 0 };
  assertConfiguration(env);
  const { tenantId, agentId } = await resolveTarget(db, env);
  const state = await inspectExisting(db, tenantId, agentId);
  if (state === 'existing') return { enabled: true, created: 0, existing: PROFILES.length };

  const transaction = await db.transaction('write');
  try {
    await createProfiles(transaction, tenantId, agentId, hooks);
    for (const rawProfile of PROFILES) {
      const profile = normalizeProfile(rawProfile);
      const result = await evaluateDossier(transaction, tenantId, profile.dossierId, {
        writeDb: transaction,
        idFactory: evaluation => stableId(profile.key, `rule-${evaluation.rule_code.toLowerCase()}`),
        updatedAt: FIXED_EVALUATION_DATE,
      });
      assertProfileResult(profile, result);
    }
    await transaction.commit();
    return { enabled: true, created: PROFILES.length, existing: 0 };
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}
