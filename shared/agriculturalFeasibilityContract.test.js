import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFeasibilityMetrics,
  buildFeasibilityReport,
  feasibilityReasonMessage,
} from './agriculturalFeasibilityContract.js';

const project = {
  project_surface_ha: 2,
  expected_yield: 4000,
  expected_price: 250,
  loss_percent: 5,
};

const reasons = {
  offline: 'navigateur hors ligne',
  not_configured: 'service Teranga non configuré',
  insufficient_context: 'culture, ville ou mois de semis manquant',
  timeout: 'délai de réponse Teranga dépassé',
  invalid_response: 'réponse Teranga invalide',
  unavailable: 'échec de la consultation Teranga',
  partial_response: 'réponse Teranga partielle',
};

test('documente les sept raisons Teranga', () => {
  for (const [reason, message] of Object.entries(reasons)) {
    assert.equal(feasibilityReasonMessage(reason), message);
  }
});

test('calcule les rendements, volumes et revenus avec la formule prudente', () => {
  const metrics = buildFeasibilityMetrics({}, project, [
    { type: 'yield', predicted_yield_kg_ha: 3200 },
  ], { mode: 'hybrid' });
  assert.equal(metrics.declared_yield, 4000);
  assert.equal(metrics.teranga_yield, 3200);
  assert.equal(metrics.retained_yield, 3200);
  assert.equal(metrics.expected_volume, 6080);
  assert.equal(metrics.declared_revenue, 1900000);
  assert.equal(metrics.retained_revenue, 1520000);
  assert.equal(metrics.revenue_adjustment, -380000);
  assert.equal(metrics.external_adjustment_applied, true);
});

test('n’accepte un rendement Teranga que depuis un signal externe numérique valide', () => {
  const generic = buildFeasibilityMetrics({ teranga_yield: 9999 }, project, [], { mode: 'hybrid' });
  const stringSignal = buildFeasibilityMetrics({}, project, [
    { type: 'yield', predicted_yield_kg_ha: '3200' },
  ], { mode: 'hybrid' });
  const partial = buildFeasibilityMetrics({}, project, [
    { type: 'yield', predicted_yield_kg_ha: 3200 },
  ], { mode: 'hybrid_partial' });
  assert.equal(generic.teranga_yield, null);
  assert.equal(stringSignal.teranga_yield, null);
  assert.equal(partial.teranga_yield, 3200);
  assert.equal(partial.retained_yield, 4000);
  assert.equal(partial.external_adjustment_applied, false);
});

test('laisse à null les métriques dont les entrées sont absentes', () => {
  const metrics = buildFeasibilityMetrics({}, { project_surface_ha: 2 }, [], { mode: 'local' });
  assert.equal(metrics.declared_yield, null);
  assert.equal(metrics.retained_yield, null);
  assert.equal(metrics.expected_volume, null);
  assert.equal(metrics.declared_revenue, null);
  assert.equal(metrics.retained_revenue, null);
  assert.equal(metrics.revenue_adjustment, null);
});

test('calcule le besoin net et plafonne le montant conseillé au besoin réel', () => {
  const financialProject = {
    ...project,
    own_contribution: 100000,
    other_funding: 50000,
    amount_requested: 1500000,
  };
  const metrics = buildFeasibilityMetrics(
    { budget_total: 1450000 }, financialProject, [], { mode: 'local' },
    { credit: { amount_requested: 1500000, interest_rate: 10, duration_months: 12 } },
  );
  assert.equal(metrics.financing_need, 1300000);
  assert.equal(metrics.recommended_amount, 1300000);
  assert.equal(metrics.overfinancing, 200000);
  assert.equal(metrics.remaining_financing_gap, 0);
  assert.equal(metrics.own_contribution, 100000);
  assert.equal(metrics.other_funding, 50000);
  assert.equal(metrics.non_debt_funding, 150000);
});

test('conseille toute la demande lorsqu’elle reste inférieure au besoin', () => {
  const metrics = buildFeasibilityMetrics(
    { budget_total: 1450000 }, {
      ...project,
      own_contribution: 100000,
      other_funding: 50000,
      amount_requested: 1200000,
    }, [], { mode: 'local' },
    { credit: { amount_requested: 1200000, interest_rate: 10, duration_months: 12 } },
  );
  assert.equal(metrics.financing_need, 1300000);
  assert.equal(metrics.recommended_amount, 1200000);
  assert.equal(metrics.overfinancing, 0);
  assert.equal(metrics.remaining_financing_gap, 100000);
});

test('sépare marge économique, principal, intérêts et trésorerie agricole indicative', () => {
  const metrics = buildFeasibilityMetrics(
    { budget_total: 1450000 }, {
      ...project,
      own_contribution: 100000,
      other_funding: 50000,
      amount_requested: 1300000,
    }, [], { mode: 'local' },
    { credit: { amount_requested: 1300000, interest_rate: 10, duration_months: 12 } },
  );
  assert.equal(metrics.retained_revenue, 1900000);
  assert.equal(metrics.economic_margin, 450000);
  assert.equal(metrics.principal_borrowed, 1300000);
  assert.equal(metrics.interest_amount, 130000);
  assert.equal(metrics.debt_service_total, 1430000);
  assert.equal(metrics.cash_before_debt_service, 1900000);
  assert.equal(metrics.treasury_after_repayment, 470000);
  assert.equal(metrics.stressed_revenue, 1520000);
  assert.equal(metrics.stressed_economic_margin, 70000);
  assert.equal(metrics.stressed_treasury_after_repayment, 90000);
  assert.equal(metrics.agricultural_repayment_possible, true);
  assert.equal(metrics.repayment_assessment_scope, 'indicative_agricultural_projection');
  assert.equal(metrics.canonical_repayment_assessment_required, true);
});
test('produit un rapport déterministe et explicite sans classement inventé', () => {
  const metrics = buildFeasibilityMetrics({}, project, [], { mode: 'local' });
  const report = buildFeasibilityReport({
    status: 'FEASIBLE',
    project,
    local: { findings: [], missing_data: [] },
    metrics,
    source: { mode: 'local', fallback_reason: 'not_configured' },
  });
  assert.match(report, /Rendement déclaré : 4000 kg\/ha/);
  assert.match(report, /Rendement Teranga : non calculé — service Teranga non configuré/);
  assert.match(report, /Volume attendu sur 2 ha : 7600 kg/);
  assert.match(report, /Revenu retenu : 1900000 FCFA/);
  assert.match(report, /Aucun classement fiable de cultures n’est disponible/);
});
