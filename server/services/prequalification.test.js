import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvaluationContext,
  calculateCapacityRatio,
  calculateEvidenceConfidence,
  classifyRepaymentCapacity,
  computePrequalificationScore,
  determinePrequalification,
  evaluatePrequalification,
  evaluateRule,
} from './prequalification.js';

const dossier = {
  applicant_name: 'Awa Faye',
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
  const sansIdentite = evaluatePrequalification(
    { ...dossier, applicant_name: null },
    cashflow(1690),
    evidence(['A', 'A', 'B']),
    [],
    rules,
  );
  const tresFaible = evaluatePrequalification(
    { ...dossier, applicant_name: null },
    cashflow(0),
    [],
    [],
    rules,
  );
  assert.equal(sansIdentite.prequalification, 'NON_ELIGIBLE');
  assert.equal(tresFaible.prequalification, 'NON_ELIGIBLE');
  assert.ok(sansIdentite.score <= 39);
  assert.ok(tresFaible.score >= 0);
  assert.ok(sansIdentite.score > tresFaible.score);
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
  assert.ok(result.score >= 0 && result.score <= 39);
});

test('le calcul est déterministe quel que soit l’ordre fourni des règles', () => {
  const input = [dossier, cashflow(1690), evidence(['A', 'B', 'A']), []];
  const first = evaluatePrequalification(...input, rules);
  const second = evaluatePrequalification(...input, [...rules].reverse());
  assert.equal(first.score, second.score);
  assert.deepEqual(first.details, second.details);
  assert.deepEqual(first.reasons, second.reasons);
});
