import { getDb, uuid } from './db.js';
import { hashPassword } from './auth.js';

const DEMO_LOAN_RATE = 12;

export const DEMO_ACCOUNTS = [
  { name: 'FresCoop SuperAdmin', email: 'superadmin@frescoop.demo', role: 'SUPERADMIN', phone: '+221770000001', agency: 'Global', passwordEnv: 'DEMO_PWD' },
  { name: 'Moussa Diallo', email: 'agent@frescoop.demo', role: 'AGENT', phone: '+221771234567', agency: 'Agence Thiès', passwordEnv: 'DEMO_PWD' },
  { name: 'Fatou Ndiaye', email: 'superviseur@frescoop.demo', role: 'SUPERVISEUR', phone: '+221772345678', agency: 'Agence Thiès', passwordEnv: 'DEMO_PWD' },
  { name: 'Ibrahima Sow', email: 'comite@frescoop.demo', role: 'COMITE', phone: '+221773456789', agency: 'Siège Dakar', passwordEnv: 'DEMO_PWD' },
  { name: 'Aminata Ba', email: 'risk@frescoop.demo', role: 'RISK_MANAGER', phone: '+221774567890', agency: 'Siège Dakar', passwordEnv: 'DEMO_PWD' },
  { name: 'Admin FresCoop', email: 'admin@frescoop.demo', role: 'ADMIN', phone: '+221770000000', agency: 'Siège Dakar', passwordEnv: 'DEMO_PWD' },
  { name: 'Oumar Sy', email: 'auditeur@frescoop.demo', role: 'AUDITEUR', phone: '+221775678901', agency: 'Siège Dakar', passwordEnv: 'DEMO_PWD' },
  { name: 'Seydina Limamou Laye', email: 'seydinalimamoulaye@gmail.com', role: 'ADMIN', phone: '+221770000010', agency: 'Siège Dakar', passwordEnv: 'ADMIN_DEFAULT_PWD' },
  { name: 'Cherif Hane', email: 'cherifhane@gmail.com', role: 'ADMIN', phone: '+221770000011', agency: 'Siège Dakar', passwordEnv: 'ADMIN_DEFAULT_PWD' },
  { name: 'Ameth Sall', email: 'amethsl2218@gmail.com', role: 'ADMIN', phone: '+221770000012', agency: 'Siège Dakar', passwordEnv: 'ADMIN_DEFAULT_PWD' },
];

export const DEMO_DOSSIERS = [
  { key: 'A', applicant_name: 'Awa Faye', amount_requested: 1500000, duration_months: 10, interest_rate: DEMO_LOAN_RATE },
  { key: 'B', applicant_name: 'Mamadou Cissé', amount_requested: 500000, duration_months: 8, interest_rate: DEMO_LOAN_RATE },
  { key: 'C', applicant_name: 'Abdoulaye Diop', amount_requested: 3000000, duration_months: 12, interest_rate: DEMO_LOAN_RATE },
  { key: 'D', applicant_name: 'Ousmane Ndiaye', amount_requested: 2000000, duration_months: 10, interest_rate: DEMO_LOAN_RATE },
].map(dossier => ({
  ...dossier,
  interest_amount: Math.round(dossier.amount_requested * dossier.interest_rate / 100),
  total_repayable: dossier.amount_requested + Math.round(dossier.amount_requested * dossier.interest_rate / 100),
}));

function passwordForAccount(account) {
  if (account.passwordEnv === 'ADMIN_DEFAULT_PWD') return process.env.ADMIN_DEFAULT_PWD || 'changeme2026';
  return process.env.DEMO_PWD || 'demo2026';
}

function isMissingFinancialColumn(error) {
  return /no column named (interest_rate|interest_amount|total_repayable)/i.test(error?.message || '');
}

async function insertSeedDossier(db, columns, values, financials) {
  const extendedColumns = [...columns, 'interest_rate', 'interest_amount', 'total_repayable'];
  const extendedValues = [...values, financials.interest_rate, financials.interest_amount, financials.total_repayable];
  try {
    await db.execute({
      sql: `INSERT INTO dossiers (${extendedColumns.join(', ')}) VALUES (${extendedValues.map(() => '?').join(', ')})`,
      args: extendedValues,
    });
  } catch (error) {
    if (!isMissingFinancialColumn(error)) throw error;
    await db.execute({
      sql: `INSERT INTO dossiers (${columns.join(', ')}) VALUES (${values.map(() => '?').join(', ')})`,
      args: values,
    });
  }
}

const AGRONOMIC_RULES = [
  {
    code: 'RULE-AGRO-001',
    name: 'Ajustement agronomique',
    condition: 'AGRONOMIC_ADJUSTMENT',
    result: 'REVUE_REQUISE',
    severity: 'medium',
    desc: 'Le Rendement retenu diffère du Rendement déclaré et requiert une revue humaine',
  },
  {
    code: 'RULE-AGRO-002',
    name: 'Revue agronomique humaine',
    condition: 'AGRONOMIC_HUMAN_REVIEW',
    result: 'REVUE_REQUISE',
    severity: 'high',
    desc: 'Les signaux agronomiques exigent une décision humaine',
  },
];

async function ensureAgronomicRules(db) {
  const tenants = await db.execute('SELECT id FROM tenants');
  for (const tenant of tenants.rows) {
    for (const rule of AGRONOMIC_RULES) {
      await db.execute({
        sql: `INSERT INTO rules (id, tenant_id, code, name, description, condition_expr, result, severity)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(tenant_id, code) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                condition_expr = excluded.condition_expr,
                result = excluded.result,
                severity = excluded.severity,
                active = 1,
                version = 1,
                updated_at = datetime('now')`,
        args: [uuid(), tenant.id, rule.code, rule.name, rule.desc, rule.condition, rule.result, rule.severity],
      });
    }
  }
}

export async function ensureAdminAccounts() {
  const db = getDb();
  const tenantRes = await db.execute('SELECT id FROM tenants LIMIT 1');
  if (tenantRes.rows.length === 0) return;
  const tenantId = tenantRes.rows[0].id;

  const juryPwd = process.env.JURY_PWD || 'jury2026';
  const admins = [
    ...DEMO_ACCOUNTS
      .filter(account => account.passwordEnv === 'ADMIN_DEFAULT_PWD')
      .map(account => ({ ...account, pwd: passwordForAccount(account) })),
    { name: 'Membre du Jury CIF', email: 'jury@frescoop.demo', role: 'JURY', phone: '', agency: 'CIF', pwd: juryPwd },
    { name: 'Évaluateur CIF', email: 'evaluateur@frescoop.demo', role: 'JURY', phone: '', agency: 'CIF', pwd: juryPwd },
  ];

  for (const a of admins) {
    try {
      const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [a.email] });
      if (existing.rows.length === 0) {
        await db.execute({
          sql: 'INSERT INTO users (id, tenant_id, email, password_hash, name, role, phone, agency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          args: [uuid(), tenantId, a.email, hashPassword(a.pwd), a.name, a.role, a.phone, a.agency],
        });
        console.log(`[FresCoop] Compte créé: ${a.email} (${a.role})`);
      }
    } catch (e) { console.log(`[FresCoop] Skip ${a.email}: ${e.message}`); }
  }
  await ensureAgronomicRules(db);
}

export async function seedIfEmpty() {
  const db = getDb();
  const check = await db.execute('SELECT COUNT(*) as count FROM tenants');
  if (check.rows[0].count > 0) return;

  console.log('[FresCoop] Seed des données de démonstration...');

  const tenantId = uuid();
  await db.execute({
    sql: `INSERT INTO tenants (id, name, code, config) VALUES (?, ?, ?, ?)`,
    args: [tenantId, 'CoopFinance Sénégal', 'COOPFIN-SN', JSON.stringify({
      country: 'SN', currency: 'FCFA', max_loan: 10000000, min_loan: 50000,
    })],
  });

  const users = DEMO_ACCOUNTS.map(account => ({
    ...account,
    id: uuid(),
    pwd: passwordForAccount(account),
  }));

  for (const u of users) {
    await db.execute({
      sql: `INSERT INTO users (id, tenant_id, email, password_hash, name, role, phone, agency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [u.id, tenantId, u.email, hashPassword(u.pwd), u.name, u.role, u.phone, u.agency],
    });
  }

  const agentId = users.find(user => user.role === 'AGENT').id;

  // Rules
  const rules = [
    { code: 'RULE-ID-001', name: 'Identité requise', condition: 'NO_IDENTITY', result: 'NON_ELIGIBLE', severity: 'critical', desc: 'L\'identité du demandeur doit être renseignée' },
    { code: 'RULE-CF-001', name: 'Cash-flow requis', condition: 'NO_CASHFLOW', result: 'REVUE_REQUISE', severity: 'high', desc: 'Le cash-flow saisonnier doit être documenté' },
    { code: 'RULE-CAP-001', name: 'Capacité insuffisante', condition: 'CAPACITY_INSUFFICIENT', result: 'NON_ELIGIBLE', severity: 'critical', desc: 'Le flux net ne couvre pas l\'échéance mensuelle' },
    { code: 'RULE-CAP-002', name: 'Capacité stressée', condition: 'CAPACITY_STRESSED', result: 'REVUE_REQUISE', severity: 'high', desc: 'Capacité insuffisante sous scénario prudent (-20%)' },
    { code: 'RULE-DEBT-001', name: 'Endettement élevé', condition: 'HIGH_EXISTING_DEBT', result: 'REVUE_REQUISE', severity: 'high', desc: 'La dette existante dépasse 50% du montant demandé' },
    { code: 'RULE-BIC-001', name: 'Retards BIC', condition: 'LATE_PAYMENTS', result: 'REVUE_REQUISE', severity: 'high', desc: 'Retards de paiement détectés au BIC' },
    { code: 'RULE-EV-001', name: 'Preuves insuffisantes', condition: 'LOW_EVIDENCE', result: 'REVUE_REQUISE', severity: 'medium', desc: 'Moins de 2 preuves au dossier' },
    { code: 'RULE-EV-002', name: 'Preuves déclaratives', condition: 'MOSTLY_DECLARATIVE', result: 'REVUE_REQUISE', severity: 'medium', desc: 'La majorité des preuves sont déclaratives (niveau D)' },
    { code: 'RULE-SEAS-001', name: 'Inadéquation saisonnière', condition: 'SEASONAL_MISMATCH', result: 'REVUE_REQUISE', severity: 'medium', desc: 'Revenus concentrés — calendrier saisonnier recommandé' },
    { code: 'RULE-AMT-001', name: 'Montant/revenus élevé', condition: 'AMOUNT_HIGH_VS_REVENUE', result: 'REVUE_REQUISE', severity: 'medium', desc: 'Le montant demandé dépasse 80% des revenus annuels' },
    ...AGRONOMIC_RULES,
  ];

  for (const r of rules) {
    await db.execute({
      sql: `INSERT INTO rules (id, tenant_id, code, name, description, condition_expr, result, severity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [uuid(), tenantId, r.code, r.name, r.desc, r.condition, r.result, r.severity],
    });
  }

  // === CAS A: Bon dossier ===
  const dossierA = uuid();
  const dossierAFinancials = DEMO_DOSSIERS.find(dossier => dossier.key === 'A');
  await insertSeedDossier(db, [
    'id', 'tenant_id', 'agent_id', 'status', 'applicant_name', 'applicant_phone', 'applicant_id_number',
    'applicant_location', 'applicant_activity', 'sector', 'activity_type', 'years_experience', 'surface_ha',
    'production_cycle', 'amount_requested', 'credit_purpose', 'duration_months', 'desired_schedule',
    'savings_amount', 'guarantee_type', 'agent_note',
  ], [
    dossierA, tenantId, agentId, 'review', 'Awa Faye', '+221776543210', 'SN-2024-78432',
    'Notto Diobass, Thiès', 'Maraîchage tomates', 'Agriculture', 'Maraîchage', 8, 2.5,
    'Oct-Mars (6 mois)', dossierAFinancials.amount_requested, 'Achat intrants et semences améliorées',
    dossierAFinancials.duration_months, 'Saisonnier (échéances mars-juin)', 200000,
    'Caution solidaire groupe', 'Productrice expérimentée, bonne relation coopérative',
  ], dossierAFinancials);

  const evidenceA = [
    { cat: 'VENTE', label: 'Vente tomates Coopérative Notto', amount: 1800000, source: 'Coopérative Notto', level: 'B', date: '2026-03-15' },
    { cat: 'VENTE', label: 'Vente oignons marché Thiès', amount: 650000, source: 'Déclaration producteur', level: 'D', date: '2026-04-20' },
    { cat: 'LIVRAISON', label: 'Livraison 2.4T tomates saison 2025', amount: null, source: 'Registre coopérative', level: 'B', date: '2025-03-10', unit: '2400 kg' },
    { cat: 'HISTORIQUE_IMF', label: 'Crédit précédent remboursé intégralement', amount: 800000, source: 'Système CoopFinance', level: 'A', date: '2025-09-30' },
    { cat: 'EPARGNE', label: 'Épargne coopérative', amount: 200000, source: 'Système CoopFinance', level: 'A', date: '2026-07-01' },
  ];

  for (const e of evidenceA) {
    await db.execute({
      sql: `INSERT INTO evidence (id, dossier_id, tenant_id, category, label, amount, unit, source, verification_level, evidence_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [uuid(), dossierA, tenantId, e.cat, e.label, e.amount, e.unit || null, e.source, e.level, e.date],
    });
  }

  const cashflowA = [
    { month: 1, revenue: 0, expenses: 350000, debt: 0 },
    { month: 2, revenue: 0, expenses: 300000, debt: 0 },
    { month: 3, revenue: 1800000, expenses: 400000, debt: 0 },
    { month: 4, revenue: 650000, expenses: 250000, debt: 0 },
    { month: 5, revenue: 300000, expenses: 200000, debt: 0 },
    { month: 6, revenue: 100000, expenses: 200000, debt: 0 },
    { month: 7, revenue: 0, expenses: 200000, debt: 0 },
    { month: 8, revenue: 0, expenses: 200000, debt: 0 },
    { month: 9, revenue: 0, expenses: 250000, debt: 0 },
    { month: 10, revenue: 0, expenses: 400000, debt: 0 },
    { month: 11, revenue: 0, expenses: 350000, debt: 0 },
    { month: 12, revenue: 0, expenses: 300000, debt: 0 },
  ];
  for (const c of cashflowA) {
    await db.execute({
      sql: `INSERT INTO cashflow_entries (id, dossier_id, tenant_id, month, year, revenue, expenses, debt_payments)
            VALUES (?, ?, ?, ?, 2026, ?, ?, ?)`,
      args: [uuid(), dossierA, tenantId, c.month, c.revenue, c.expenses, c.debt],
    });
  }

  // === CAS B: Thin file ===
  const dossierB = uuid();
  const dossierBFinancials = DEMO_DOSSIERS.find(dossier => dossier.key === 'B');
  await insertSeedDossier(db, [
    'id', 'tenant_id', 'agent_id', 'status', 'applicant_name', 'applicant_phone', 'applicant_id_number',
    'applicant_location', 'applicant_activity', 'sector', 'activity_type', 'years_experience', 'surface_ha',
    'production_cycle', 'amount_requested', 'credit_purpose', 'duration_months', 'desired_schedule',
    'savings_amount', 'guarantee_type', 'agent_note',
  ], [
    dossierB, tenantId, agentId, 'verification', 'Mamadou Cissé', '+221778901234', 'SN-2024-91205',
    'Keur Moussa, Thiès', 'Culture arachide', 'Agriculture', 'Cultures pluviales', 3, 1,
    'Juin-Nov (5 mois)', dossierBFinancials.amount_requested, 'Semences et engrais campagne hivernage',
    dossierBFinancials.duration_months, 'Mensuel classique', 50000, 'Caution solidaire',
    'Premier crédit, peu d historique numérique mais activité confirmée par visite terrain',
  ], dossierBFinancials);

  const evidenceB = [
    { cat: 'VISITE_TERRAIN', label: 'Visite parcelle confirmée - 1ha arachide', amount: null, source: 'Agent de crédit', level: 'B', date: '2026-07-20' },
    { cat: 'VENTE', label: 'Vente arachide saison 2025 (déclaration)', amount: 400000, source: 'Déclaration producteur', level: 'D', date: '2025-12-15' },
  ];
  for (const e of evidenceB) {
    await db.execute({
      sql: `INSERT INTO evidence (id, dossier_id, tenant_id, category, label, amount, unit, source, verification_level, evidence_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [uuid(), dossierB, tenantId, e.cat, e.label, e.amount, e.unit || null, e.source, e.level, e.date],
    });
  }

  const cashflowB = [
    { month: 1, revenue: 0, expenses: 100000, debt: 0 },
    { month: 2, revenue: 0, expenses: 100000, debt: 0 },
    { month: 3, revenue: 0, expenses: 100000, debt: 0 },
    { month: 4, revenue: 0, expenses: 100000, debt: 0 },
    { month: 5, revenue: 0, expenses: 100000, debt: 0 },
    { month: 6, revenue: 0, expenses: 150000, debt: 0 },
    { month: 7, revenue: 0, expenses: 200000, debt: 0 },
    { month: 8, revenue: 0, expenses: 150000, debt: 0 },
    { month: 9, revenue: 0, expenses: 100000, debt: 0 },
    { month: 10, revenue: 0, expenses: 100000, debt: 0 },
    { month: 11, revenue: 200000, expenses: 100000, debt: 0 },
    { month: 12, revenue: 400000, expenses: 150000, debt: 0 },
  ];
  for (const c of cashflowB) {
    await db.execute({
      sql: `INSERT INTO cashflow_entries (id, dossier_id, tenant_id, month, year, revenue, expenses, debt_payments)
            VALUES (?, ?, ?, ?, 2026, ?, ?, ?)`,
      args: [uuid(), dossierB, tenantId, c.month, c.revenue, c.expenses, c.debt],
    });
  }

  // === CAS C: Risque ===
  const dossierC = uuid();
  const dossierCFinancials = DEMO_DOSSIERS.find(dossier => dossier.key === 'C');
  await insertSeedDossier(db, [
    'id', 'tenant_id', 'agent_id', 'status', 'applicant_name', 'applicant_phone', 'applicant_id_number',
    'applicant_location', 'applicant_activity', 'sector', 'activity_type', 'years_experience', 'surface_ha',
    'production_cycle', 'amount_requested', 'credit_purpose', 'duration_months', 'desired_schedule',
    'savings_amount', 'guarantee_type', 'agent_note',
  ], [
    dossierC, tenantId, agentId, 'review', 'Abdoulaye Diop', '+221779012345', 'SN-2023-45678',
    'Mbour, Thiès', 'Pêche artisanale + maraîchage', 'Agriculture', 'Mixte', 5, 0.5, 'Continu',
    dossierCFinancials.amount_requested, 'Achat moteur pirogue + intrants maraîchage',
    dossierCFinancials.duration_months, 'Mensuel', 100000, 'Nantissement pirogue',
    'Attention: dette existante + incohérence revenus déclarés',
  ], dossierCFinancials);

  await db.execute({
    sql: `INSERT INTO bic_records (id, tenant_id, applicant_id_number, institution, credit_type, amount, outstanding, monthly_payment, status, start_date, days_late)
          VALUES (?, ?, 'SN-2023-45678', 'MicroCred Sénégal', 'Crédit équipement', 1500000, 900000, 125000, 'en_cours', '2025-06-01', 45)`,
    args: [uuid(), tenantId],
  });

  const evidenceC = [
    { cat: 'VENTE', label: 'Revenus pêche déclarés', amount: 2500000, source: 'Déclaration producteur', level: 'D', date: '2026-06-01' },
    { cat: 'VENTE', label: 'Revenus maraîchage déclarés', amount: 800000, source: 'Déclaration producteur', level: 'D', date: '2026-06-01' },
  ];
  for (const e of evidenceC) {
    await db.execute({
      sql: `INSERT INTO evidence (id, dossier_id, tenant_id, category, label, amount, unit, source, verification_level, evidence_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [uuid(), dossierC, tenantId, e.cat, e.label, e.amount, null, e.source, e.level, e.date],
    });
  }

  const cashflowC = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, revenue: 200000 + Math.floor(Math.random() * 100000), expenses: 250000, debt: 125000,
  }));
  for (const c of cashflowC) {
    await db.execute({
      sql: `INSERT INTO cashflow_entries (id, dossier_id, tenant_id, month, year, revenue, expenses, debt_payments)
            VALUES (?, ?, ?, ?, 2026, ?, ?, ?)`,
      args: [uuid(), dossierC, tenantId, c.month, c.revenue, c.expenses, c.debt],
    });
  }

  // === CAS D: Saisonnalité ===
  const dossierD = uuid();
  const dossierDFinancials = DEMO_DOSSIERS.find(dossier => dossier.key === 'D');
  await insertSeedDossier(db, [
    'id', 'tenant_id', 'agent_id', 'status', 'applicant_name', 'applicant_phone', 'applicant_id_number',
    'applicant_location', 'applicant_activity', 'sector', 'activity_type', 'years_experience', 'surface_ha',
    'production_cycle', 'amount_requested', 'credit_purpose', 'duration_months', 'desired_schedule',
    'savings_amount', 'guarantee_type', 'agent_note',
  ], [
    dossierD, tenantId, agentId, 'draft', 'Ousmane Ndiaye', '+221770123456', 'SN-2024-33210',
    'Ross Béthio, Saint-Louis', 'Riziculture', 'Agriculture', 'Riziculture irriguée', 12, 5,
    'Juil-Déc (6 mois)', dossierDFinancials.amount_requested, 'Intrants campagne rizicole',
    dossierDFinancials.duration_months, 'Saisonnier post-récolte', 300000,
    'Caution solidaire + nantissement récolte',
    'Producteur expérimenté, revenus très saisonniers concentrés déc-fév',
  ], dossierDFinancials);

  const evidenceD = [
    { cat: 'LIVRAISON', label: 'Livraison 8T riz paddy à SAED', amount: 2400000, source: 'SAED (Société nationale)', level: 'A', date: '2026-01-20', unit: '8000 kg' },
    { cat: 'VENTE', label: 'Vente riz transformé marché local', amount: 600000, source: 'Déclaration producteur', level: 'D', date: '2026-02-15' },
    { cat: 'HISTORIQUE_IMF', label: '2 crédits précédents remboursés', amount: 1500000, source: 'Système CoopFinance', level: 'A', date: '2025-03-01' },
  ];
  for (const e of evidenceD) {
    await db.execute({
      sql: `INSERT INTO evidence (id, dossier_id, tenant_id, category, label, amount, unit, source, verification_level, evidence_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [uuid(), dossierD, tenantId, e.cat, e.label, e.amount, e.unit || null, e.source, e.level, e.date],
    });
  }

  const cashflowD = [
    { month: 1, revenue: 2400000, expenses: 200000, debt: 0 },
    { month: 2, revenue: 600000, expenses: 200000, debt: 0 },
    { month: 3, revenue: 0, expenses: 200000, debt: 0 },
    { month: 4, revenue: 0, expenses: 200000, debt: 0 },
    { month: 5, revenue: 0, expenses: 200000, debt: 0 },
    { month: 6, revenue: 0, expenses: 200000, debt: 0 },
    { month: 7, revenue: 0, expenses: 500000, debt: 0 },
    { month: 8, revenue: 0, expenses: 400000, debt: 0 },
    { month: 9, revenue: 0, expenses: 300000, debt: 0 },
    { month: 10, revenue: 0, expenses: 300000, debt: 0 },
    { month: 11, revenue: 0, expenses: 250000, debt: 0 },
    { month: 12, revenue: 0, expenses: 200000, debt: 0 },
  ];
  for (const c of cashflowD) {
    await db.execute({
      sql: `INSERT INTO cashflow_entries (id, dossier_id, tenant_id, month, year, revenue, expenses, debt_payments)
            VALUES (?, ?, ?, ?, 2026, ?, ?, ?)`,
      args: [uuid(), dossierD, tenantId, c.month, c.revenue, c.expenses, c.debt],
    });
  }

  // Credit Products
  await db.execute({
    sql: `INSERT INTO credit_products (id, tenant_id, code, name, min_amount, max_amount, min_duration, max_duration, max_rate, eligible_sectors)
          VALUES (?, ?, 'AGRI-INTRANT', 'Crédit intrants agricoles', 100000, 3000000, 4, 12, 15, ?)`,
    args: [uuid(), tenantId, JSON.stringify(['Agriculture', 'Élevage'])],
  });
  await db.execute({
    sql: `INSERT INTO credit_products (id, tenant_id, code, name, min_amount, max_amount, min_duration, max_duration, max_rate, eligible_sectors)
          VALUES (?, ?, 'COM-EQUIP', 'Crédit équipement commerce', 200000, 5000000, 6, 24, 18, ?)`,
    args: [uuid(), tenantId, JSON.stringify(['Commerce agricole', 'Transformation'])],
  });

  // Consent records for dossier A
  const consentTypes = ['data_collection', 'bic_check', 'credit_check'];
  for (const ct of consentTypes) {
    await db.execute({
      sql: `INSERT INTO consent_records (id, dossier_id, tenant_id, applicant_name, consent_type, consent_given, consent_date, consent_method, witness)
            VALUES (?, ?, ?, 'Awa Faye', ?, 1, '2026-08-10', 'verbal', 'Moussa Diallo')`,
      args: [uuid(), dossierA, tenantId, ct],
    });
  }

  // Field visit for dossier A
  await db.execute({
    sql: `INSERT INTO field_visits (id, dossier_id, tenant_id, agent_id, visit_date, gps_lat, gps_lon, observations, photos_count, activity_confirmed)
          VALUES (?, ?, ?, ?, '2026-08-12', 14.7645, -16.9358, 'Parcelle de 2.5 ha confirmée. Tomates en pleine production. Système irrigation fonctionnel. Coopérative voisine confirmée.', 3, 1)`,
    args: [uuid(), dossierA, tenantId, agentId],
  });

  console.log(`[FresCoop] Seed terminé: 1 IMF, ${users.length} utilisateurs, ${DEMO_DOSSIERS.length} dossiers démo, ${rules.length} règles, 2 produits crédit`);
  console.log('[FresCoop] Comptes de démonstration créés; mots de passe lus depuis les variables d’environnement.');
}
