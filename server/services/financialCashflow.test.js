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

test('ignore tout revenu agricole déclaré hors évaluation projet', () => {
  const entries = buildFinancialCashflow({
    agriculture_revenue: 999999,
    commerce_revenue: 1000,
    commerce_revenue_frequency: 'mensuel',
  }, {}, []);
  assert.equal(entries.reduce((sum, entry) => sum + entry.revenue_detail.agriculture, 0), 0);
  assert.equal(entries.reduce((sum, entry) => sum + entry.revenue, 0), 12000);
});
