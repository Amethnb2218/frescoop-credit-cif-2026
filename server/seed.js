import { getDb, uuid } from './db.js';
import { hashPassword } from './auth.js';

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

  const users = [
    { id: uuid(), name: 'FresCoop SuperAdmin', email: 'superadmin@frescoop.demo', role: 'SUPERADMIN', phone: '+221770000001', agency: 'Global', password: 'demo2026' },
    { id: uuid(), name: 'Moussa Diallo', email: 'agent@frescoop.demo', role: 'AGENT', phone: '+221771234567', agency: 'Agence Thiès', password: 'demo2026' },
    { id: uuid(), name: 'Fatou Ndiaye', email: 'superviseur@frescoop.demo', role: 'SUPERVISEUR', phone: '+221772345678', agency: 'Agence Thiès', password: 'demo2026' },
    { id: uuid(), name: 'Ibrahima Sow', email: 'comite@frescoop.demo', role: 'COMITE', phone: '+221773456789', agency: 'Siège Dakar', password: 'demo2026' },
    { id: uuid(), name: 'Aminata Ba', email: 'risk@frescoop.demo', role: 'RISK_MANAGER', phone: '+221774567890', agency: 'Siège Dakar', password: 'demo2026' },
    { id: uuid(), name: 'Admin FresCoop', email: 'admin@frescoop.demo', role: 'ADMIN', phone: '+221770000000', agency: 'Siège Dakar', password: 'demo2026' },
    { id: uuid(), name: 'Oumar Sy', email: 'auditeur@frescoop.demo', role: 'AUDITEUR', phone: '+221775678901', agency: 'Siège Dakar', password: 'demo2026' },
    { id: uuid(), name: 'Seydina Limamou Laye', email: 'seydinalimamoulaye@gmail.com', role: 'ADMIN', phone: '+221770000010', agency: 'Siège Dakar', password: 'passer123' },
    { id: uuid(), name: 'Cherif Hane', email: 'cherifhane@gmail.com', role: 'ADMIN', phone: '+221770000011', agency: 'Siège Dakar', password: 'passer123' },
    { id: uuid(), name: 'Ameth Sall', email: 'amethsl2218@gmail.com', role: 'ADMIN', phone: '+221770000012', agency: 'Siège Dakar', password: 'passer123' },
  ];

  for (const u of users) {
    await db.execute({
      sql: `INSERT INTO users (id, tenant_id, email, password_hash, name, role, phone, agency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [u.id, tenantId, u.email, hashPassword(u.password), u.name, u.role, u.phone, u.agency],
    });
  }

  const agentId = users[0].id;

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
  await db.execute({
    sql: `INSERT INTO dossiers (id, tenant_id, agent_id, status, applicant_name, applicant_phone, applicant_id_number, applicant_location, applicant_activity, sector, activity_type, years_experience, surface_ha, production_cycle, amount_requested, credit_purpose, duration_months, desired_schedule, savings_amount, guarantee_type, agent_note)
          VALUES (?, ?, ?, 'review', 'Awa Faye', '+221776543210', 'SN-2024-78432', 'Notto Diobass, Thiès', 'Maraîchage tomates', 'Agriculture', 'Maraîchage', 8, 2.5, 'Oct-Mars (6 mois)', 1500000, 'Achat intrants et semences améliorées', 10, 'Saisonnier (échéances mars-juin)', 200000, 'Caution solidaire groupe', 'Productrice expérimentée, bonne relation coopérative')`,
    args: [dossierA, tenantId, agentId],
  });

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
  await db.execute({
    sql: `INSERT INTO dossiers (id, tenant_id, agent_id, status, applicant_name, applicant_phone, applicant_id_number, applicant_location, applicant_activity, sector, activity_type, years_experience, surface_ha, production_cycle, amount_requested, credit_purpose, duration_months, desired_schedule, savings_amount, guarantee_type, agent_note)
          VALUES (?, ?, ?, 'verification', 'Mamadou Cissé', '+221778901234', 'SN-2024-91205', 'Keur Moussa, Thiès', 'Culture arachide', 'Agriculture', 'Cultures pluviales', 3, 1.0, 'Juin-Nov (5 mois)', 500000, 'Semences et engrais campagne hivernage', 8, 'Mensuel classique', 50000, 'Caution solidaire', 'Premier crédit, peu d historique numérique mais activité confirmée par visite terrain')`,
    args: [dossierB, tenantId, agentId],
  });

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
  await db.execute({
    sql: `INSERT INTO dossiers (id, tenant_id, agent_id, status, applicant_name, applicant_phone, applicant_id_number, applicant_location, applicant_activity, sector, activity_type, years_experience, surface_ha, production_cycle, amount_requested, credit_purpose, duration_months, desired_schedule, savings_amount, guarantee_type, agent_note)
          VALUES (?, ?, ?, 'review', 'Abdoulaye Diop', '+221779012345', 'SN-2023-45678', 'Mbour, Thiès', 'Pêche artisanale + maraîchage', 'Agriculture', 'Mixte', 5, 0.5, 'Continu', 3000000, 'Achat moteur pirogue + intrants maraîchage', 12, 'Mensuel', 100000, 'Nantissement pirogue', 'Attention: dette existante + incohérence revenus déclarés')`,
    args: [dossierC, tenantId, agentId],
  });

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
  await db.execute({
    sql: `INSERT INTO dossiers (id, tenant_id, agent_id, status, applicant_name, applicant_phone, applicant_id_number, applicant_location, applicant_activity, sector, activity_type, years_experience, surface_ha, production_cycle, amount_requested, credit_purpose, duration_months, desired_schedule, savings_amount, guarantee_type, agent_note)
          VALUES (?, ?, ?, 'draft', 'Ousmane Ndiaye', '+221770123456', 'SN-2024-33210', 'Ross Béthio, Saint-Louis', 'Riziculture', 'Agriculture', 'Riziculture irriguée', 12, 5.0, 'Juil-Déc (6 mois)', 2000000, 'Intrants campagne rizicole', 10, 'Saisonnier post-récolte', 300000, 'Caution solidaire + nantissement récolte', 'Producteur expérimenté, revenus très saisonniers concentrés déc-fév')`,
    args: [dossierD, tenantId, agentId],
  });

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

  console.log('[FresCoop] Seed terminé: 1 IMF, 7 utilisateurs, 4 dossiers démo, 10 règles, 2 produits crédit');
  console.log('[FresCoop] Connexion: agent@frescoop.demo / demo2026');
}
