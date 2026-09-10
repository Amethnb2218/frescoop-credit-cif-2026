import test from 'node:test';
import assert from 'node:assert/strict';
import { annualizeRevenue, buildFinancialCashflow } from './financialCashflow.js';

test('annualise chaque source selon sa fréquence propre', () => {
  assert.equal(annualizeRevenue(1000, 'hebdomadaire'), 52000);
  assert.equal(annualizeRevenue(1000, 'mensuel'), 12000);
  assert.equal(annualizeRevenue(1000, 'saisonnier'), 1000);
  assert.throws(() => annualizeRevenue(1000, 'quotidien'), /Fréquence invalide/);
});

test('construit un cash-flow avec fréquences commerce et autres distinctes', () => {
  const entries = buildFinancialCashflow({
    commerce_revenue: 1000,
    commerce_revenue_frequency: 'hebdomadaire',
    other_revenue: 12000,
    other_revenue_frequency: 'saisonnier',
    household_expenses: 500,
  }, { harvest_month: 10, expected_revenue: 24000 }, [], 2026);
  assert.equal(entries.length, 12);
  assert.equal(entries[0].revenue, Math.round(52000 / 12));
  assert.equal(entries[9].revenue, Math.round(52000 / 12) + 12000 + 24000);
  assert.equal(entries.reduce((sum, entry) => sum + entry.revenue_detail.agriculture, 0), 24000);
  assert.deepEqual(entries[0].revenue_detail.financial_inputs, {
    commerce_revenue: 1000,
    commerce_revenue_frequency: 'hebdomadaire',
    other_revenue: 12000,
    other_revenue_frequency: 'saisonnier',
    agricultural_expenses: 0,
    household_expenses: 500,
    other_expenses: 0,
  });
});

test('priorise retained_revenue et expose la source ainsi que l’audit agricole', () => {
  const entries = buildFinancialCashflow({}, {
    harvest_month: 10,
    expected_revenue: 1900000,
    declared_revenue: 1900000,
    retained_revenue: 1520000,
    revenue_adjustment: -380000,
  });
  assert.equal(entries[9].revenue_detail.agriculture, 1520000);
  assert.equal(entries[9].revenue_detail.agriculture_source, 'retained_revenue');
  assert.deepEqual(entries[9].revenue_detail.agriculture_audit, {
    declared_revenue: 1900000,
    retained_revenue: 1520000,
    revenue_adjustment: -380000,
  });
  assert.equal(entries.reduce((sum, entry) => sum + entry.revenue_detail.agriculture, 0), 1520000);
});

test('lit retained_revenue dans calculated_metrics avant expected_revenue', () => {
  const entries = buildFinancialCashflow({}, {
    harvest_month: 3,
    expected_revenue: 1900000,
    calculated_metrics: {
      declared_revenue: 1900000,
      retained_revenue: 1520000,
      revenue_adjustment: -380000,
    },
  });
  assert.equal(entries[2].revenue_detail.agriculture, 1520000);
  assert.equal(entries[2].revenue_detail.agriculture_source, 'retained_revenue');
});

test('conserve expected_revenue pour les anciens dossiers', () => {
  const entries = buildFinancialCashflow({}, { harvest_month: 4, expected_revenue: 24000 });
  assert.equal(entries[3].revenue_detail.agriculture, 24000);
  assert.equal(entries[3].revenue_detail.agriculture_source, 'project_assessment');
  assert.deepEqual(entries[3].revenue_detail.agriculture_audit, {
    declared_revenue: null,
    retained_revenue: null,
    revenue_adjustment: null,
  });
});
test('fusionne une ancienne autre charge dans le ménage une seule fois', () => {
  const entries = buildFinancialCashflow({
    commerce_revenue: 1000,
    commerce_revenue_frequency: 'mensuel',
    agricultural_expenses: 100,
    household_expenses: 200,
    other_expenses: 50,
  }, {}, []);
  assert.equal(entries[0].expenses, 350);
  assert.equal(entries[0].expenses_detail.household, 250);
  assert.equal(entries[0].expenses_detail.legacy_other_merged, 50);
  assert.equal('other' in entries[0].expenses_detail, false);
});

test('ne crée pas de faux revenu agricole quand l’évaluation est incomplète', () => {
  assert.deepEqual(buildFinancialCashflow({}, {
    harvest_month: 4,
    expected_revenue: null,
    calculated_metrics: { retained_revenue: null, expected_revenue: null },
  }), []);
});

test('ignore tout revenu agricole déclaré hors évaluation projet', () => {
  const entries = buildFinancialCashflow({
    agriculture_revenue: 999999,
    commerce_revenue: 1000,
    commerce_revenue_frequency: 'mensuel',
  }, {}, []);
  assert.equal(entries.reduce((sum, entry) => sum + entry.revenue_detail.agriculture, 0), 0);
  assert.equal(entries.reduce((sum, entry) => sum + entry.revenue, 0), 12000);
});
