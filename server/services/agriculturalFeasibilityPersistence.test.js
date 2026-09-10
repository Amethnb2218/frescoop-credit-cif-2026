import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agriculturalAssessmentStatement,
  agriculturalFeasibilityRecord,
} from './agriculturalFeasibilityPersistence.js';

const analysis = {
  status: 'ADJUST',
  evaluated_at: '2026-09-10T12:00:00.000Z',
  source: { mode: 'hybrid', engine_version: 2, fallback_reason: null },
  details: {
    metrics: {
      teranga_yield: 3200,
      retained_yield: 3200,
      declared_revenue: 1900000,
      retained_revenue: 1520000,
    },
    external_signals: [{ type: 'risk', level: 'moderate', safety_score: 64 }],
  },
};

const local = {
  adequacy_status: 'ADEQUATE', viability_status: 'VIABLE', confidence_level: 'HIGH',
  orientation: 'CONTINUE', metrics: { expected_revenue: 1900000 }, findings: [], rules_version: 4,
};

const project = {
  crop_code: 'RICE', crop_label: 'Riz', project_surface_ha: 2,
  expected_yield: 4000, expected_price: 250, loss_percent: 5,
};

test('sérialise les champs hybrides auditables', () => {
  assert.deepEqual(agriculturalFeasibilityRecord(analysis), {
    feasibility_status: 'ADJUST', feasibility_mode: 'hybrid', teranga_yield: 3200,
    retained_yield: 3200, declared_revenue: 1900000, retained_revenue: 1520000,
    safety_score: 64, risk_level: 'moderate', fallback_reason: null,
    feasibility_version: 2, feasibility_analysis: JSON.stringify(analysis),
  });
});

test('construit une instruction unique pour la persistance du projet', () => {
  const statement = agriculturalAssessmentStatement({
    dossierId: 'd1', tenantId: 't1', project, local, analysis, id: 'a1',
  });
  assert.match(statement.sql, /feasibility_analysis/);
  assert.match(statement.sql, /retained_revenue/);
  assert.equal(statement.args.length, 48);
  assert.equal(statement.args.at(-1), JSON.stringify(analysis));
});
