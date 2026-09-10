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
  assert.deepEqual(result.metrics, {
    budget_total: null,
    financing_gap: null,
    gross_production: null,
    saleable_production: null,
    expected_revenue: null,
    gross_margin: null,
    campaign_roi: null,
  });
  assert.deepEqual(result.missing_data, [
    { code: 'CROP_REQUIRED', field: 'crop_label', label: 'culture' },
    { code: 'SURFACE_REQUIRED', field: 'project_surface_ha', label: 'surface du projet' },
    { code: 'AGRO_ZONE_REQUIRED', field: 'agro_zone', label: 'zone agroécologique' },
    { code: 'SOIL_TYPE_REQUIRED', field: 'soil_type', label: 'type de sol' },
    { code: 'SEASON_REQUIRED', field: 'season', label: 'saison' },
    { code: 'CULTIVATION_MODE_REQUIRED', field: 'cultivation_mode', label: 'mode de culture' },
    { code: 'YIELD_REQUIRED', field: 'expected_yield', label: 'rendement attendu' },
    { code: 'PRICE_REQUIRED', field: 'expected_price', label: 'prix de vente' },
    { code: 'LOSS_PERCENT_REQUIRED', field: 'loss_percent', label: 'pertes estimées' },
    { code: 'INPUT_REQUIRED', field: 'input_items', label: 'intrants du projet' },
  ]);
});

test('distingue les intrants absents des intrants sans coût positif', () => {
  const absent = assessAgriculturalProject(complete, [], []);
  const noPositiveCost = assessAgriculturalProject(complete, [
    { label: 'Semences', quantity: 1, unit_cost: 0 },
  ], []);
  assert.equal(absent.missing_data.at(-1).code, 'INPUT_REQUIRED');
  assert.equal(noPositiveCost.missing_data.at(-1).code, 'POSITIVE_INPUT_COST_REQUIRED');
  assert.equal(absent.metrics.budget_total, null);
  assert.equal(noPositiveCost.metrics.budget_total, null);
});

test('le calcul reste déterministe quel que soit l’ordre des intrants', () => {
  const second = { category: 'transport', label: 'Transport', quantity: 2, unit_cost: 25000 };
  assert.deepEqual(
    assessAgriculturalProject(complete, [...items, second], []),
    assessAgriculturalProject(complete, [second, ...items], []),
  );
});
