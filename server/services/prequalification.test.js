import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvaluationContext,
  buildRepaymentSchedule,
  calculateScheduleCoverage,
  calculateCapacityRatio,
  calculateStressedCapacityRatio,
  calculateEvidenceConfidence,
  classifyRepaymentCapacity,
  computePrequalificationScore,
  determinePrequalification,
  evaluatePrequalification,
  evaluateRule,
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

function cashflow(net) {
  return [{ revenue: net, expenses: 0, debt_payments: 0 }];
}

function evidence(levels) {
  return levels.map(verification_level => ({ verification_level }));
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

test('un dossier complet atteint la tranche préqualifiée', () => {
  const result = evaluatePrequalification(dossier, cashflow(1690), evidence(['A', 'A', 'A']), [], rules);
  assert.equal(result.prequalification, 'PREQUALIFIE');
  assert.equal(result.score, 100);
  assert.equal(result.details.components.capacity.points, 35);
});

test('deux dossiers non éligibles gardent des scores différents', () => {
  const capaciteLimitee = evaluatePrequalification(
    dossier,
    cashflow(1000),
    evidence(['A', 'A', 'B']),
    [],
    rules,
  );
  const tresFaible = evaluatePrequalification(
    { ...dossier, amount_requested: 2600 },
    cashflow(1300),
    evidence(['D']),
    [],
    rules,
  );
  assert.equal(capaciteLimitee.prequalification, 'NON_ELIGIBLE');
  assert.equal(tresFaible.prequalification, 'NON_ELIGIBLE');
  assert.ok(capaciteLimitee.score >= 0 && capaciteLimitee.score <= 100);
  assert.ok(tresFaible.score >= 0 && tresFaible.score <= 100);
  assert.notEqual(capaciteLimitee.score, tresFaible.score);
});

test('un dossier incomplet ne reçoit aucun score numérique', () => {
  const result = evaluatePrequalification(
    { ...dossier, applicant_id_number: null },
    [],
    [],
    [],
    rules,
  );
  assert.equal(result.score, null);
  assert.equal(result.repaymentCapacity, 'UNKNOWN');
  assert.equal(result.details.message, 'Non calculé — données insuffisantes');
});

test('la complétion puis le recalcul produit un score numérique', () => {
  const incomplete = evaluatePrequalification({ ...dossier, activity_type: null }, cashflow(1690), evidence(['A']), [], rules);
  const complete = evaluatePrequalification(dossier, cashflow(1690), evidence(['A']), [], rules);
  assert.equal(incomplete.score, null);
  assert.equal(typeof complete.score, 'number');
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
  const input = [dossier, cashflow(1690), evidence(['A', 'B', 'A']), []];
  const first = evaluatePrequalification(...input, rules);
  const second = evaluatePrequalification(...input, [...rules].reverse());
  assert.equal(first.score, second.score);
  assert.deepEqual(first.details, second.details);
  assert.deepEqual(first.reasons, second.reasons);
});
