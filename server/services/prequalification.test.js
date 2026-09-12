import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvaluationContext,
  buildRepaymentSchedule,
  calculateScheduleCoverage,
  calculateCapacityRatio,
  calculateDeclaredCapacityRatio,
  calculateDeclaredStressedCapacityRatio,
  calculateStressedCapacityRatio,
  calculateEvidenceConfidence,
  classifyRepaymentCapacity,
  computePrequalificationScore,
  determinePrequalification,
  evaluatePrequalification,
  evaluateRule,
  listMissingPrequalificationData,
} from './prequalification.js';

const dossier = {
  applicant_name: 'Awa Faye',
  applicant_id_number: 'SN-2024-78432',
  sector: 'Agriculture',
  activity_type: 'Maraîchage',
  amount_requested: 1300,
  duration_months: 1,
};

const rules = [
  { id: 'id', code: 'RULE-ID-001', condition_expr: 'NO_IDENTITY', result: 'NON_ELIGIBLE', severity: 'critical', name: 'Identité' },
  { id: 'cap', code: 'RULE-CAP-001', condition_expr: 'CAPACITY_INSUFFICIENT', result: 'NON_ELIGIBLE', severity: 'critical', name: 'Capacité' },
  { id: 'evidence', code: 'RULE-EV-001', condition_expr: 'LOW_EVIDENCE', result: 'REVUE_REQUISE', severity: 'medium', name: 'Preuves' },
];

const agriculturalRules = [
  ...rules,
  { id: 'adjust', code: 'RULE-AGRO-001', condition_expr: 'AGRONOMIC_ADJUSTMENT', result: 'REVUE_REQUISE', severity: 'medium', name: 'Ajustement agronomique' },
  { id: 'review', code: 'RULE-AGRO-002', condition_expr: 'AGRONOMIC_HUMAN_REVIEW', result: 'REVUE_REQUISE', severity: 'high', name: 'Revue agronomique' },
];

function cashflow(net, agriculture = null) {
  return [{
    revenue: net,
    expenses: 0,
    debt_payments: 0,
    ...(agriculture == null ? {} : { revenue_detail: { agriculture } }),
  }];
}

function evidence(levels) {
  return levels.map(verification_level => ({ verification_level }));
}

const agriculturalProject = {
  crop_code: 'TOMATO',
  crop_label: 'Tomate',
  project_surface_ha: 1,
  expected_yield: 15000,
  expected_price: 350,
};
const agriculturalInputs = [{ total_cost: 250000 }];

function evaluateComplete(inputDossier, inputCashflow, inputEvidence, inputRules = rules) {
  return evaluatePrequalification(
    inputDossier,
    inputCashflow,
    inputEvidence,
    [],
    inputRules,
    agriculturalProject,
    agriculturalInputs,
  );
}

test('calcule la capacité sur le flux mensuel moyen observé', () => {
  const annualCashflow = Array.from({ length: 12 }, () => ({ revenue: 200, expenses: 50, debt_payments: 20 }));
  const context = buildEvaluationContext({ ...dossier, amount_requested: 1200, duration_months: 12 }, annualCashflow, [], []);
  assert.equal(calculateCapacityRatio(context), 1.3);
  assert.ok(Math.abs(calculateStressedCapacityRatio(context) - 0.9) < 1e-10);
  assert.equal(context.averageMonthlyNet, 130);
  assert.equal(context.monthlyPayment, 100);
});

test('un échéancier saisonnier place les remboursements sur les mois de recette', () => {
  const seasonalCashflow = [
    { revenue: 0, expenses: 100, debt_payments: 0 },
    { revenue: 0, expenses: 100, debt_payments: 0 },
    { revenue: 1500, expenses: 100, debt_payments: 0 },
    { revenue: 900, expenses: 100, debt_payments: 0 },
  ];
  const schedule = buildRepaymentSchedule('SEASONAL', 1200, 4, seasonalCashflow);
  assert.deepEqual(schedule, [0, 0, 600, 600]);
  const coverage = calculateScheduleCoverage(seasonalCashflow, schedule);
  assert.deepEqual(coverage.payment_months, [3, 4]);
  assert.equal(coverage.ratio, 2);
  assert.equal(coverage.minimum_margin, 600);
});

test('la capacité saisonnière contrôle chaque échéance et son stress', () => {
  const seasonalCashflow = [
    { revenue: 0, expenses: 100, debt_payments: 0 },
    { revenue: 0, expenses: 100, debt_payments: 0 },
    { revenue: 1000, expenses: 100, debt_payments: 0 },
    { revenue: 700, expenses: 100, debt_payments: 0 },
  ];
  const context = buildEvaluationContext({
    ...dossier,
    amount_requested: 1200,
    duration_months: 4,
    desired_schedule: 'Saisonnier (post-récolte)',
  }, seasonalCashflow, [], []);
  assert.equal(context.scheduleType, 'SEASONAL');
  assert.ok(Math.abs(calculateCapacityRatio(context) - (700 / 600)) < 1e-10);
  assert.ok(Math.abs(calculateStressedCapacityRatio(context) - 0.6) < 1e-10);
  assert.equal(classifyRepaymentCapacity(calculateCapacityRatio(context)), 'LIMIT');
  assert.equal(classifyRepaymentCapacity(calculateStressedCapacityRatio(context)), 'INSUFFICIENT');
});

test('classifie exactement les seuils de capacité', () => {
  assert.equal(classifyRepaymentCapacity(1.3), 'SUFFICIENT');
  assert.equal(classifyRepaymentCapacity(1.299), 'LIMIT');
  assert.equal(classifyRepaymentCapacity(1), 'LIMIT');
  assert.equal(classifyRepaymentCapacity(0.999), 'INSUFFICIENT');
  assert.equal(classifyRepaymentCapacity(null), 'UNKNOWN');
});

test('une capacité inconnue ne déclenche pas la règle critique', () => {
  const context = buildEvaluationContext(dossier, [], [], []);
  assert.equal(calculateCapacityRatio(context), null);
  assert.equal(evaluateRule(rules[1], context).triggered, false);
  const decision = determinePrequalification([], 'LOW', 'UNKNOWN');
  assert.equal(decision.prequalification, 'REVUE_REQUISE');
});

test('calcule la confiance selon le volume et la qualité des preuves', () => {
  assert.equal(calculateEvidenceConfidence(buildEvaluationContext(dossier, [], [], [])), 'LOW');
  assert.equal(calculateEvidenceConfidence(buildEvaluationContext(dossier, [], evidence(['A', 'D']), [])), 'MEDIUM');
  assert.equal(calculateEvidenceConfidence(buildEvaluationContext(dossier, [], evidence(['A', 'A', 'D']), [])), 'MEDIUM');
  assert.equal(calculateEvidenceConfidence(buildEvaluationContext(dossier, [], evidence(['A', 'A', 'B', 'D']), [])), 'HIGH');
});

test('ignore les preuves inactives dans le score', () => {
  const context = buildEvaluationContext(dossier, [], [
    { verification_level: 'A', status: 'active' },
    { verification_level: 'B', status: 'expired' },
    { verification_level: 'C', status: 'disputed' },
    { verification_level: 'D', status: 'superseded' },
  ], []);
  assert.deepEqual(context.evidenceCounts, { A: 1, B: 0, C: 0, D: 0 });
  assert.equal(context.totalEvidence, 1);
});

test('un dossier complet atteint la tranche préqualifiée', () => {
  const result = evaluateComplete(dossier, cashflow(1690), evidence(['A', 'A', 'A']));
  assert.equal(result.prequalification, 'PREQUALIFIE');
  assert.equal(result.score, 100);
  assert.equal(result.details.components.capacity.points, 35);
});

test('deux dossiers non éligibles gardent des scores différents', () => {
  const capaciteLimitee = evaluateComplete(
    dossier,
    cashflow(1000),
    evidence(['A', 'A', 'B']),
  );
  const tresFaible = evaluateComplete(
    { ...dossier, amount_requested: 2600 },
    cashflow(1300),
    evidence(['D']),
  );
  assert.equal(capaciteLimitee.prequalification, 'NON_ELIGIBLE');
  assert.equal(tresFaible.prequalification, 'NON_ELIGIBLE');
  assert.ok(capaciteLimitee.score >= 0 && capaciteLimitee.score <= 100);
  assert.ok(tresFaible.score >= 0 && tresFaible.score <= 100);
  assert.notEqual(capaciteLimitee.score, tresFaible.score);
});

test('un dossier incomplet reçoit un score provisoire explicable', () => {
  const result = evaluatePrequalification(
    { ...dossier, applicant_id_number: null },
    [],
    [],
    [],
    rules,
  );
  assert.equal(typeof result.score, 'number');
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(result.score, 30);
  assert.equal(result.repaymentCapacity, 'UNKNOWN');
  assert.equal(result.details.status, 'INSUFFICIENT_DATA');
  assert.equal(result.details.provisional, true);
  assert.match(result.details.message, /Score provisoire calculé sur les données disponibles/);
  assert.equal(result.details.raw_score, 30);
  assert.deepEqual(result.details.components, {
    identity: { points: 15, maximum: 15 },
    capacity: { points: 0, maximum: 35 },
    evidence: { points: 0, maximum: 30, coverage: 0, quality: 0 },
    risk: { points: 15, maximum: 20 },
  });
  assert.equal(result.details.capacity_ratio, null);
  assert.equal(result.details.retained_capacity_ratio, null);
  assert.equal(result.details.stressed_capacity_ratio, null);
  assert.deepEqual(result.details.missing_data.map(item => item.code), [
    'APPLICANT_ID_REQUIRED',
    'CASHFLOW_REQUIRED',
    'AGRICULTURAL_PROJECT_REQUIRED',
    'AGRICULTURAL_INPUT_REQUIRED',
  ]);
});

test('énumère les prérequis manquants dans un ordre stable', () => {
  const emptyDossier = {
    applicant_name: null,
    applicant_id_number: null,
    sector: 'Commerce',
    activity_type: null,
    amount_requested: 0,
    duration_months: 0,
  };
  const context = buildEvaluationContext(emptyDossier, [], [], []);
  const missing = listMissingPrequalificationData(emptyDossier, context);
  assert.deepEqual(missing, [
    { code: 'APPLICANT_NAME_REQUIRED', field: 'applicant_name', label: 'Nom du demandeur' },
    { code: 'APPLICANT_ID_REQUIRED', field: 'applicant_id_number', label: 'Numéro d’identité' },
    { code: 'AGRICULTURE_SECTOR_REQUIRED', field: 'sector', label: 'Secteur Agriculture' },
    { code: 'ACTIVITY_TYPE_REQUIRED', field: 'activity_type', label: 'Type d’activité' },
    { code: 'POSITIVE_AMOUNT_REQUIRED', field: 'amount_requested', label: 'Montant demandé positif' },
    { code: 'POSITIVE_DURATION_REQUIRED', field: 'duration_months', label: 'Durée du crédit positive' },
    { code: 'CASHFLOW_REQUIRED', field: 'cashflow_entries', label: 'Flux de trésorerie' },
    { code: 'AGRICULTURAL_PROJECT_REQUIRED', field: 'agricultural_project', label: 'Évaluation du projet agricole' },
    { code: 'AGRICULTURAL_INPUT_REQUIRED', field: 'agricultural_input_items', label: 'Au moins un intrant agricole' },
  ]);
});

test('distingue un cash-flow sans revenu d’un cash-flow absent', () => {
  const noCashflow = evaluatePrequalification(dossier, [], [], [], rules, agriculturalProject, agriculturalInputs);
  const noRevenue = evaluatePrequalification(
    dossier,
    [{ revenue: 0, expenses: 100, debt_payments: 0 }],
    [],
    [],
    rules,
    agriculturalProject,
    agriculturalInputs,
  );
  assert.deepEqual(noCashflow.details.missing_data.map(item => item.code), ['CASHFLOW_REQUIRED']);
  assert.deepEqual(noRevenue.details.missing_data.map(item => item.code), ['POSITIVE_REVENUE_MONTH_REQUIRED']);
});

test('distingue un projet agricole absent d’un projet partiel', () => {
  const absent = evaluatePrequalification(dossier, cashflow(1690), [], [], rules, null, agriculturalInputs);
  const partial = evaluatePrequalification(
    dossier,
    cashflow(1690),
    [],
    [],
    rules,
    { crop_code: null, crop_label: null, project_surface_ha: 0, expected_yield: 0, expected_price: 0 },
    agriculturalInputs,
  );
  assert.deepEqual(absent.details.missing_data.map(item => item.code), ['AGRICULTURAL_PROJECT_REQUIRED']);
  assert.deepEqual(partial.details.missing_data.map(item => item.code), [
    'CROP_REQUIRED',
    'POSITIVE_PROJECT_SURFACE_REQUIRED',
    'POSITIVE_EXPECTED_YIELD_REQUIRED',
    'POSITIVE_EXPECTED_PRICE_REQUIRED',
  ]);
});

test('distingue les intrants absents des intrants sans coût positif', () => {
  const absent = evaluatePrequalification(dossier, cashflow(1690), [], [], rules, agriculturalProject, []);
  const noCost = evaluatePrequalification(
    dossier,
    cashflow(1690),
    [],
    [],
    rules,
    agriculturalProject,
    [{ total_cost: 0 }, { total_cost: null }],
  );
  assert.deepEqual(absent.details.missing_data.map(item => item.code), ['AGRICULTURAL_INPUT_REQUIRED']);
  assert.deepEqual(noCost.details.missing_data.map(item => item.code), ['POSITIVE_INPUT_COST_REQUIRED']);
});

test('la complétion fait passer le score de provisoire à définitif', () => {
  const incomplete = evaluateComplete({ ...dossier, activity_type: null }, cashflow(1690), evidence(['A']));
  const complete = evaluateComplete(dossier, cashflow(1690), evidence(['A']));
  assert.equal(typeof incomplete.score, 'number');
  assert.equal(incomplete.details.provisional, true);
  assert.equal(incomplete.details.status, 'INSUFFICIENT_DATA');
  assert.equal(typeof complete.score, 'number');
  assert.equal(complete.details.provisional, undefined);
  assert.equal(complete.details.status, undefined);
});

test('conserve un score numérique égal à zéro', () => {
  const context = buildEvaluationContext(dossier, cashflow(1), [], []);
  const result = computePrequalificationScore(
    { ...context, hasIdentity: false },
    [{ triggered: true, rule_code: 'RULE-ZERO', severity: 'critical' }],
    'NON_ELIGIBLE',
    0,
  );
  assert.equal(result.score, 0);
  assert.equal(result.details.raw_score, 0);
});

test('les pénalités se cumulent sans rendre le risque négatif', () => {
  const context = buildEvaluationContext(dossier, cashflow(1300), evidence(['A']), []);
  const evaluations = [
    { triggered: true, rule_code: 'A', severity: 'medium' },
    { triggered: true, rule_code: 'B', severity: 'high' },
    { triggered: true, rule_code: 'C', severity: 'critical' },
  ];
  const result = computePrequalificationScore(context, evaluations, 'NON_ELIGIBLE', 1);
  assert.equal(result.details.components.risk.points, 0);
  assert.ok(result.score >= 0 && result.score <= 100);
});

test('le calcul est déterministe quel que soit l’ordre fourni des règles', () => {
  const first = evaluateComplete(dossier, cashflow(1690), evidence(['A', 'B', 'A']), rules);
  const second = evaluateComplete(dossier, cashflow(1690), evidence(['A', 'B', 'A']), [...rules].reverse());
  assert.equal(first.score, second.score);
  assert.deepEqual(first.details, second.details);
  assert.deepEqual(first.reasons, second.reasons);
});

test('expose les capacités déclarée et retenue avec leur stress', () => {
  const project = {
    ...agriculturalProject,
    feasibility_status: 'ADJUST',
    feasibility_mode: 'hybrid',
    declared_revenue: 1690,
    retained_revenue: 900,
    teranga_yield: 8000,
    retained_yield: 8000,
  };
  const context = buildEvaluationContext(dossier, cashflow(900, 900), [], [], project);
  assert.equal(calculateCapacityRatio(context), 900 / 1300);
  assert.equal(calculateDeclaredCapacityRatio(context), 1690 / 1300);
  assert.equal(calculateStressedCapacityRatio(context), 720 / 1300);
  assert.equal(calculateDeclaredStressedCapacityRatio(context), 1352 / 1300);
});

test('Teranga seul ne peut pas transformer une capacité acceptable en refus', () => {
  const project = {
    ...agriculturalProject,
    feasibility_status: 'ADJUST',
    feasibility_mode: 'hybrid',
    declared_revenue: 1690,
    retained_revenue: 900,
    teranga_yield: 8000,
    retained_yield: 8000,
  };
  const result = evaluatePrequalification(
    dossier,
    cashflow(900, 900),
    evidence(['A', 'A', 'A']),
    [],
    agriculturalRules,
    project,
    agriculturalInputs,
  );
  const capacityRule = result.evaluations.find(item => item.rule_code === 'RULE-CAP-001');
  assert.equal(result.prequalification, 'REVUE_REQUISE');
  assert.equal(capacityRule.triggered, false);
  assert.equal(capacityRule.neutralized, true);
  assert.equal(result.details.agronomic_impact.capacity_rule_neutralized, true);
  assert.equal(result.details.agronomic_impact.declared_capacity_ratio, 1.3);
  assert.ok(result.details.agronomic_impact.retained_capacity_ratio < 1);
});

test('la règle financière reste critique si les deux capacités sont insuffisantes', () => {
  const project = {
    ...agriculturalProject,
    feasibility_status: 'ADJUST',
    feasibility_mode: 'hybrid',
    declared_revenue: 1200,
    retained_revenue: 900,
    teranga_yield: 8000,
    retained_yield: 8000,
  };
  const result = evaluatePrequalification(
    dossier,
    cashflow(900, 900),
    evidence(['A', 'A', 'A']),
    [],
    agriculturalRules,
    project,
    agriculturalInputs,
  );
  assert.equal(result.prequalification, 'NON_ELIGIBLE');
  assert.equal(result.evaluations.find(item => item.rule_code === 'RULE-CAP-001').triggered, true);
});

test('HUMAN_REVIEW déclenche une revue et FEASIBLE aucune règle agronomique', () => {
  const human = evaluatePrequalification(
    dossier,
    cashflow(1690, 1690),
    evidence(['A', 'A', 'A']),
    [],
    agriculturalRules,
    { ...agriculturalProject, feasibility_status: 'HUMAN_REVIEW', feasibility_mode: 'hybrid' },
    agriculturalInputs,
  );
  const feasible = evaluatePrequalification(
    dossier,
    cashflow(1690, 1690),
    evidence(['A', 'A', 'A']),
    [],
    agriculturalRules,
    { ...agriculturalProject, feasibility_status: 'FEASIBLE', feasibility_mode: 'hybrid' },
    agriculturalInputs,
  );
  assert.equal(human.prequalification, 'REVUE_REQUISE');
  assert.equal(human.evaluations.find(item => item.rule_code === 'RULE-AGRO-002').triggered, true);
  assert.equal(feasible.evaluations.find(item => item.rule_code === 'RULE-AGRO-001').triggered, false);
  assert.equal(feasible.evaluations.find(item => item.rule_code === 'RULE-AGRO-002').triggered, false);
});

test('le fallback local ne déclenche aucune pénalité Teranga', () => {
  const result = evaluatePrequalification(
    dossier,
    cashflow(1690, 1690),
    evidence(['A', 'A', 'A']),
    [],
    agriculturalRules,
    {
      ...agriculturalProject,
      feasibility_status: 'ADJUST',
      feasibility_mode: 'local_fallback',
      declared_revenue: 1690,
      retained_revenue: 1690,
    },
    agriculturalInputs,
  );
  assert.equal(result.prequalification, 'PREQUALIFIE');
  assert.equal(result.details.agronomic_impact.fallback_used, true);
  assert.deepEqual(result.details.agronomic_impact.review_rules, []);
  assert.equal(result.details.components.risk.points, 20);
});
