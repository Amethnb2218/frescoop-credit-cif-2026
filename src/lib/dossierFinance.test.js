import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProjectBudget } from './dossierFinance.js';

const items = [
  { category: 'Intrants', quantity: 1, unit_cost: 1_000_000 },
  { category: 'Matériel', quantity: 1, unit_cost: 450_000 },
];

test('calcule le besoin net par la formule budget moins apport et autres financements', () => {
  const budget = calculateProjectBudget(items, {
    own_contribution: 100_000,
    other_funding: 50_000,
    amount_requested: 1_500_000,
  });
  assert.equal(budget.total, 1_450_000);
  assert.equal(budget.realNeed, 1_300_000);
  assert.equal(budget.overfinancing, 200_000);
  assert.equal(budget.advisedAmount, 1_300_000);
});

test('ne conseille jamais plus que le montant demandé', () => {
  const budget = calculateProjectBudget(items, {
    own_contribution: 100_000,
    other_funding: 50_000,
    amount_requested: 700_000,
  });
  assert.equal(budget.realNeed, 1_300_000);
  assert.equal(budget.advisedAmount, 700_000);
  assert.equal(budget.overfinancing, 0);
});
