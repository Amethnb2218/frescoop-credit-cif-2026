import test from 'node:test';
import assert from 'node:assert/strict';
import { assessAgriculturalProject } from './agriculturalAssessment.js';

const complete = {
  crop_label: 'Riz', project_surface_ha: 2, previous_surface_ha: 2,
  agro_zone: 'Vallée du fleuve Sénégal', soil_type: 'Argileux', season: 'saison sèche',
  cultivation_mode: 'irrigué', water_source: 'Canal', expected_yield: 4000,
  expected_price: 250, loss_percent: 5, own_contribution: 100000,
  other_funding: 0, amount_requested: 200000,
};
const items = [{ category: 'semences', label: 'Semences', quantity: 1, unit_cost: 300000 }];

test('un projet cohérent retourne des résultats explicables', () => {
  const result = assessAgriculturalProject(complete, items, [
    { verification_level: 'A' }, { verification_level: 'B' },
  ]);
  assert.equal(result.adequacy_status, 'ADEQUATE');
  assert.equal(result.viability_status, 'VIABLE');
  assert.equal(result.confidence_level, 'HIGH');
  assert.equal(result.metrics.budget_total, 300000);
  assert.equal(result.metrics.financing_gap, 200000);
  assert.ok(result.metrics.gross_margin > 0);
});

test('une culture irriguée sans eau est incompatible et revue humainement', () => {
  const result = assessAgriculturalProject({ ...complete, water_source: '' }, items, []);
  assert.equal(result.adequacy_status, 'INCOMPATIBLE');
  assert.equal(result.orientation, 'REVUE_HUMAINE');
  assert.ok(result.findings.some(item => item.code === 'WATER_REQUIRED'));
});

test('les données manquantes demandent un complément, pas un faux rejet', () => {
  const result = assessAgriculturalProject({}, [], []);
  assert.equal(result.adequacy_status, 'INSUFFICIENT_DATA');
  assert.equal(result.viability_status, 'INSUFFICIENT_DATA');
  assert.equal(result.orientation, 'COLLECTER_PREUVES');
});

test('le calcul reste déterministe quel que soit l’ordre des intrants', () => {
  const second = { category: 'transport', label: 'Transport', quantity: 2, unit_cost: 25000 };
  assert.deepEqual(
    assessAgriculturalProject(complete, [...items, second], []),
    assessAgriculturalProject(complete, [second, ...items], []),
  );
});
