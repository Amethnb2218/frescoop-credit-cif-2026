import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessAgriculturalFeasibility,
  normalizeRiskResponse,
  normalizeYieldResponse,
  summarizeAgriculturalFeasibility,
} from './agriculturalFeasibility.js';
import { assessAgriculturalProject } from './agriculturalAssessment.js';

const project = {
  crop_label: 'Riz', project_surface_ha: 2, agro_zone: 'Saint-Louis',
  soil_type: 'Argileux', season: 'saison sèche', cultivation_mode: 'irrigué',
  water_source: 'Canal', expected_yield: 4000, expected_price: 250,
  loss_percent: 5, own_contribution: 100000, amount_requested: 200000,
  sowing_month: 6,
};
const inputItems = [{ label: 'Intrants', quantity: 1, unit_cost: 300000 }];

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test('la synthèse locale distingue faisable, ajustement et revue humaine', () => {
  const feasible = assessAgriculturalProject(project, inputItems, []);
  assert.equal(summarizeAgriculturalFeasibility(feasible).status, 'FEASIBLE');

  const adjust = assessAgriculturalProject({ ...project, soil_type: '' }, inputItems, []);
  assert.equal(summarizeAgriculturalFeasibility(adjust).status, 'ADJUST');

  const review = assessAgriculturalProject({ ...project, water_source: '' }, inputItems, []);
  assert.equal(summarizeAgriculturalFeasibility(review).status, 'HUMAN_REVIEW');
});

test('le rendement Teranga exige predicted_yield_kg_ha numérique et conserve sa valeur', () => {
  const signal = normalizeYieldResponse({ predicted_yield_kg_ha: 3900 }, 4000);
  assert.equal(signal.level, 'coherent');
  assert.equal(signal.predicted_yield_kg_ha, 3900);
  assert.equal(normalizeYieldResponse({ predicted_yield_kg_ha: 1800 }, 4000).level, 'conflict');
  assert.equal(normalizeYieldResponse({ predicted_yield_kg_ha: '3900' }, 4000), null);
  assert.equal(normalizeYieldResponse({ ensemble: { predicted_yield_kg: 3900 } }, 4000), null);
  assert.equal(normalizeYieldResponse({ predicted_yield_kg_ha: -1 }, 4000), null);
});

test('le risque Teranga exige safety_score, niveau et recommandation normalisés', () => {
  assert.deepEqual(normalizeRiskResponse({
    safety_score: 42, niveau: 'high', recommandation: 'Reporter le semis',
  }), {
    type: 'risk', safety_score: 42, level: 'high',
    recommendation: 'Reporter le semis', explanation: 'Reporter le semis',
  });
  assert.equal(normalizeRiskResponse({ safety_score: 60, niveau: 'moderate', recommandation: 'Surveiller' }).level, 'moderate');
  assert.equal(normalizeRiskResponse({ safety_score: 80, niveau: 'information', recommandation: 'Continuer' }).level, 'information');
  assert.equal(normalizeRiskResponse({ safety_score: 101, niveau: 'high', recommandation: 'Stop' }), null);
  assert.equal(normalizeRiskResponse({ safety_score: 60, recommandation: 'Sans niveau' }), null);
  assert.equal(normalizeRiskResponse({ safetyScore: 60, level: 'moderate', recommendation: 'Ancien format' }), null);
});

test('sans configuration, le service retourne immédiatement le moteur local sans réduction', async () => {
  const result = await assessAgriculturalFeasibility({ project, input_items: inputItems });
  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.source.mode, 'local_offline');
  assert.equal(result.source.contract_version, 2);
  assert.equal(result.source.fallback_reason, 'not_configured');
  assert.equal(result.source.teranga.attempted, false);
  assert.equal(result.details.metrics.declared_yield, 4000);
  assert.equal(result.details.metrics.teranga_yield, null);
  assert.equal(result.details.metrics.retained_yield, 4000);
  assert.equal(result.details.metrics.declared_revenue, 1900000);
  assert.equal(result.details.metrics.retained_revenue, 1900000);
  assert.equal(result.details.metrics.revenue_adjustment, 0);
});

test('les deux réponses Teranga produisent un résultat hybride sans altérer les métriques', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    return url.includes('predict-yield')
      ? response({ predicted_yield_kg_ha: 4100 })
      : response({ safety_score: 84, niveau: 'information', recommandation: 'Risque acceptable' });
  };
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example/', fetchImpl });

  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.source.mode, 'hybrid');
  assert.equal(result.details.external_signals.length, 2);
  assert.equal(result.details.metrics.expected_revenue, 1900000);
  assert.equal(result.details.metrics.declared_yield, 4000);
  assert.equal(result.details.metrics.teranga_yield, 4100);
  assert.equal(result.details.metrics.retained_yield, 4000);
  assert.equal(result.details.metrics.declared_revenue, 1900000);
  assert.equal(result.details.metrics.retained_revenue, 1900000);
  assert.equal(result.details.risk.safety_score, 84);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => url.includes('saint-louis')));
});

test('le rendement Teranga inférieur devient le rendement retenu et réduit le revenu', async () => {
  const fetchImpl = async url => url.includes('predict-yield')
    ? response({ predicted_yield_kg_ha: 3200 })
    : response({ safety_score: 80, niveau: 'information', recommandation: 'Continuer' });
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl });
  assert.equal(result.details.metrics.declared_yield, 4000);
  assert.equal(result.details.metrics.teranga_yield, 3200);
  assert.equal(result.details.metrics.retained_yield, 3200);
  assert.equal(result.details.metrics.declared_revenue, 1900000);
  assert.equal(result.details.metrics.retained_revenue, 1520000);
  assert.equal(result.details.metrics.revenue_adjustment, -380000);
  assert.equal(result.details.metrics.external_adjustment_applied, true);
});

test('un risque modéré ou élevé demande un ajustement', async () => {
  const fetchImpl = async url => url.includes('predict-yield')
    ? response({ predicted_yield_kg_ha: 4000 })
    : response({ safety_score: 60, niveau: 'moderate', recommandation: 'Mesures préventives recommandées' });
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl });
  assert.equal(result.status, 'ADJUST');
  assert.equal(result.details.external_signals[1].level, 'moderate');
});

test('une réponse externe partielle conserve le résultat local', async () => {
  const fetchImpl = async url => {
    if (url.includes('/risk/')) throw new Error('http_503');
    return response({ predicted_yield_kg_ha: 4000 });
  };
  const result = await assessAgriculturalFeasibility({
    project: { ...project, expected_yield: 5000 }, input_items: inputItems,
    context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl });
  assert.equal(result.source.mode, 'hybrid_partial');
  assert.equal(result.source.fallback_reason, 'partial_response');
  assert.equal(result.details.metrics.teranga_yield, 4000);
  assert.equal(result.details.metrics.retained_yield, 5000);
  assert.equal(result.details.metrics.retained_revenue, result.details.metrics.declared_revenue);
  assert.equal(result.details.metrics.external_adjustment_applied, false);
});

test('une réponse invalide active un repli explicite', async () => {
  const fetchImpl = async () => response({ message: 'format inconnu' });
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl });
  assert.equal(result.source.mode, 'local_fallback');
  assert.equal(result.source.fallback_reason, 'invalid_response');
  assert.equal(result.details.external_signals.length, 0);
});

test('un timeout des deux appels active le repli local', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl, timeoutMs: 5 });
  assert.equal(result.source.mode, 'local_fallback');
  assert.equal(result.source.fallback_reason, 'timeout');
});

test('un mois ou un contexte invalide empêche tout appel externe', async () => {
  let called = false;
  const result = await assessAgriculturalFeasibility({
    project: { ...project, sowing_month: 13 }, input_items: inputItems,
    context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(result.source.fallback_reason, 'insufficient_context');
});
