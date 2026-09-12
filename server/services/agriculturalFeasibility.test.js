import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessAgriculturalFeasibility,
  normalizeChatResponse,
  normalizeRiskResponse,
  normalizeYieldResponse,
  summarizeAgriculturalFeasibility,
} from './agriculturalFeasibility.js';
import { assessAgriculturalProject } from './agriculturalAssessment.js';

const project = {
  crop_label: 'Riz', project_surface_ha: 2, agro_zone: 'Saint-Louis',
  soil_type: 'Argileux', season: 'saison sèche', cultivation_mode: 'irrigué',
  water_source: 'Canal', expected_yield: 4000, expected_price: 250,
  loss_percent: 5, own_contribution: 100000, other_funding: 0,
  amount_requested: 200000, interest_rate_percent: 10, sowing_month: 6,
};
const inputItems = [{ label: 'Intrants', quantity: 1, unit_cost: 300000 }];

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test('la synthèse locale distingue faisable, ajustement et revue humaine', () => {
  assert.equal(summarizeAgriculturalFeasibility(
    assessAgriculturalProject(project, inputItems, []), [], {}, project, inputItems,
  ).status, 'FEASIBLE');
  assert.equal(summarizeAgriculturalFeasibility(
    assessAgriculturalProject({ ...project, soil_type: '' }, inputItems, []), [], {}, project, inputItems,
  ).status, 'ADJUST');
  assert.equal(summarizeAgriculturalFeasibility(
    assessAgriculturalProject({ ...project, water_source: '' }, inputItems, []), [], {}, project, inputItems,
  ).status, 'HUMAN_REVIEW');
});

test('le rendement Teranga exige une valeur numérique native sans lire le texte', () => {
  assert.equal(normalizeYieldResponse({ predicted_yield_kg_ha: 3900 }, 4000).predicted_yield_kg_ha, 3900);
  assert.equal(normalizeYieldResponse({ ensemble: { predicted_yield_kg: 3700 } }, 4000).predicted_yield_kg_ha, 3700);
  assert.equal(normalizeYieldResponse({ prediction: { ensemble_kg: 3650 } }, 4000).predicted_yield_kg_ha, 3650);
  assert.equal(normalizeYieldResponse({ predicted_yield_kg_ha: null, ensemble: { predicted_yield_kg: 3596 } }, 4000).predicted_yield_kg_ha, 3596);
  assert.equal(normalizeYieldResponse({ predicted_yield_kg_ha: 1800 }, 4000).level, 'conflict');
  assert.equal(normalizeYieldResponse({ ensemble: { predicted_yield_kg: '3700' } }, 4000), null);
  assert.equal(normalizeYieldResponse({ predicted_yield_kg_ha: '3900' }, 4000), null);
  assert.equal(normalizeYieldResponse({ message: 'Rendement estimé : 3900 kg/ha' }, 4000), null);
});

test('le risque Teranga exige strictement ses trois champs', () => {
  assert.deepEqual(normalizeRiskResponse({
    safety_score: 42, niveau: 'high', recommandation: 'Reporter le semis',
  }), {
    type: 'risk', safety_score: 42, level: 'high',
    recommendation: 'Reporter le semis', explanation: 'Reporter le semis',
  });
  assert.deepEqual(normalizeRiskResponse({
    safetyScore: 98, recommendation: 'Risque acceptable — procéder au semis',
  }), {
    type: 'risk', safety_score: 98, level: 'information',
    recommendation: 'Risque acceptable — procéder au semis',
    explanation: 'Risque acceptable — procéder au semis',
  });
  assert.equal(normalizeRiskResponse({ safety_score: 60, recommandation: 'Sans niveau' })?.level, 'moderate');
  assert.equal(normalizeRiskResponse({ safety_score: 49, recommandation: 'Risque élevé' })?.level, 'high');
  assert.equal(normalizeRiskResponse({ safety_score: 50, recommandation: 'Risque modéré' })?.level, 'moderate');
  assert.equal(normalizeRiskResponse({ safety_score: 74, recommandation: 'Risque modéré' })?.level, 'moderate');
  assert.equal(normalizeRiskResponse({ safety_score: 75, recommandation: 'Information' })?.level, 'information');
});

test('le chat valide uniquement un texte et sépare ses métadonnées', () => {
  assert.deepEqual(normalizeChatResponse({
    message: 'Rapport narratif.', source: 'teranga-api', model: 'agri-v1',
    degraded: true, notice: 'Données météo partielles', predicted_yield_kg_ha: 9999,
  }), {
    message: 'Rapport narratif.', source: 'teranga-api', model: 'agri-v1',
    degraded: true, notice: 'Données météo partielles',
  });
  assert.equal(normalizeChatResponse({ message: 1234 }), null);
  assert.equal(normalizeChatResponse({ predicted_yield_kg_ha: 3900 }), null);
});

test('sans configuration explicite, utilise le backend public Teranga par défaut', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.endsWith('/api/chat')) return response({ message: 'Rapport Teranga.', source: 'teranga-api' });
    if (url.includes('predict-yield')) return response({ ensemble: { predicted_yield_kg: 3200 } });
    return response({ safetyScore: 84, recommendation: 'Risque acceptable' });
  };
  const result = await assessAgriculturalFeasibility({ project, input_items: inputItems }, { fetchImpl });
  assert.equal(result.source.mode, 'hybrid');
  assert.equal(result.source.contract_version, 3);
  assert.equal(result.source.fallback_reason, null);
  assert.equal(result.source.teranga.available, true);
  assert.ok(calls.every(url => url.startsWith('https://teranga-ai.onrender.com/')));
  assert.equal(result.details.metrics.real_financing_need, 200000);
  assert.equal(result.details.metrics.overfinancing, 0);
  assert.equal(result.details.metrics.interest_amount, 20000);
  assert.equal(result.details.metrics.total_due, 220000);
  assert.equal(result.details.metrics.declared_yield, 4000);
  assert.equal(result.details.metrics.predicted_yield_kg_ha, 3200);
  assert.equal(result.details.metrics.retained_revenue, 1520000);
  assert.equal(result.details.metrics.stress_revenue_minus_20_percent, 1216000);
  assert.ok(result.report.narrative.includes('besoin réel'));
});

test('une configuration vide explicite conserve le rapport local déterministe', async () => {
  const result = await assessAgriculturalFeasibility(
    { project, input_items: inputItems },
    { baseUrl: '' },
  );
  assert.equal(result.source.mode, 'local_offline');
  assert.equal(result.source.fallback_reason, 'not_configured');
  assert.equal(result.source.teranga.degraded, true);
  assert.ok(result.source.teranga.notice.includes("n'est pas configuré"));
});

test('appelle rendement, risque et POST /api/chat avec des messages français structurés', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/api/chat')) return response({
      message: 'Le projet est rentable sous les hypothèses fournies.',
      source: 'teranga-api', model: 'agri-v2', degraded: false, notice: 'Avis indicatif',
    });
    if (url.includes('predict-yield')) return response({ predicted_yield_kg_ha: 3200 });
    return response({ safety_score: 84, niveau: 'information', recommandation: 'Risque acceptable' });
  };
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example/', fetchImpl });
  assert.equal(result.source.mode, 'hybrid');
  assert.equal(result.details.metrics.predicted_yield_kg_ha, 3200);
  assert.equal(result.details.metrics.retained_yield, 3200);
  assert.equal(result.details.metrics.declared_revenue, 1900000);
  assert.equal(result.details.metrics.retained_revenue, 1520000);
  assert.equal(result.source.teranga.source, 'teranga-api');
  assert.equal(result.source.teranga.model, 'agri-v2');
  assert.equal(result.source.teranga.notice, 'Avis indicatif');
  assert.equal(result.report.teranga_narrative, 'Le projet est rentable sous les hypothèses fournies.');
  const chatCall = calls.find(call => call.url.endsWith('/api/chat'));
  assert.equal(chatCall.options.method, 'POST');
  const chatBody = JSON.parse(chatCall.options.body);
  assert.equal(chatBody.language, 'fr');
  assert.equal(chatBody.messages.length, 2);
  assert.equal(chatBody.messages[0].role, 'system');
  assert.equal(chatBody.messages[1].role, 'user');
  assert.match(chatBody.messages[1].content, /Projet :/);
  assert.match(chatBody.messages[1].content, /Budget :/);
  assert.match(chatBody.messages[1].content, /Crédit :/);
  assert.doesNotMatch(chatBody.messages[1].content, /\[object Object\]/);
});

test('normalise la culture principale selon le contrat Teranga', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.endsWith('/api/chat')) return response({ message: 'Rapport Teranga.' });
    if (url.includes('/predict-yield/mais/')) return response({ ensemble: { predicted_yield_kg: 3200 } });
    if (url.includes('/risk/mais/')) return response({ safetyScore: 84, recommendation: 'Risque acceptable' });
    return response({}, false, 404);
  };
  const result = await assessAgriculturalFeasibility({
    project: { ...project, crop_label: 'Maïs, Tomate' }, input_items: inputItems,
  }, { baseUrl: 'https://teranga.example', fetchImpl });
  assert.equal(result.source.mode, 'hybrid');
  assert.equal(result.details.metrics.predicted_yield_kg_ha, 3200);
  assert.ok(calls.some(url => url.includes('/predict-yield/mais/')));
  assert.ok(calls.some(url => url.includes('/risk/mais/')));
});

test('une réponse chat invalide conserve les signaux structurés en hybride partiel', async () => {
  const fetchImpl = async url => {
    if (url.endsWith('/api/chat')) return response({ source: 'teranga', model: 'agri-v2' });
    if (url.includes('predict-yield')) return response({ ensemble: { predicted_yield_kg: 3200 } });
    return response({ safety_score: 84, niveau: 'information', recommandation: 'Risque acceptable' });
  };
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl });
  assert.equal(result.source.mode, 'hybrid_partial');
  assert.equal(result.source.fallback_reason, 'partial_response');
  assert.equal(result.source.fallback_used, true);
  assert.equal(result.source.teranga.available, true);
  assert.equal(result.source.teranga.degraded, true);
  assert.ok(result.source.teranga.notice.includes('répondu partiellement'));
  assert.equal(result.details.metrics.predicted_yield_kg_ha, 3200);
  assert.equal(result.details.metrics.retained_yield, 3200);
  assert.equal(result.details.metrics.retained_revenue, 1520000);
  assert.equal(result.details.metrics.external_adjustment_applied, true);
  assert.equal(result.details.external_signals.length, 2);
  assert.equal(result.details.risk.safety_score, 84);
});

test('un chat valide reste dans le rapport si rendement et risque échouent', async () => {
  const fetchImpl = async url => {
    if (url.endsWith('/api/chat')) return response({
      message: 'Narratif Teranga conservé.', source: 'teranga-api', model: 'agri-v2',
    });
    throw new Error('http_503');
  };
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl });
  assert.equal(result.source.mode, 'hybrid_partial');
  assert.equal(result.source.fallback_reason, 'partial_response');
  assert.equal(result.source.fallback_used, true);
  assert.equal(result.source.teranga.available, true);
  assert.equal(result.source.teranga.degraded, true);
  assert.equal(result.report.teranga_narrative, 'Narratif Teranga conservé.');
  assert.equal(result.details.report.teranga_narrative, 'Narratif Teranga conservé.');
  assert.equal(result.details.external_signals.length, 0);
  assert.equal(result.details.metrics.predicted_yield_kg_ha, null);
});

test('sans aucun signal valide, une réponse invalide déclenche le repli local approprié', async () => {
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, {
    baseUrl: 'https://teranga.example',
    fetchImpl: async () => response({ message: 1234, predicted_yield_kg_ha: '3200' }),
  });
  assert.equal(result.source.mode, 'local_fallback');
  assert.equal(result.source.fallback_reason, 'invalid_response');
  assert.equal(result.source.fallback_used, true);
  assert.equal(result.source.teranga.available, false);
  assert.equal(result.details.external_signals.length, 0);
});

test('sans aucun signal valide, une indisponibilité déclenche le repli local approprié', async () => {
  const result = await assessAgriculturalFeasibility({
    project, input_items: inputItems, context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl: async () => { throw new Error('network'); } });
  assert.equal(result.source.mode, 'local_fallback');
  assert.equal(result.source.fallback_reason, 'unavailable');
  assert.equal(result.source.fallback_used, true);
  assert.equal(result.source.teranga.available, false);
});

test('un timeout conserve le local avec la cause timeout', async () => {
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
  assert.ok(result.source.teranga.notice.includes("délai imparti"));
});

test('un contexte incomplet empêche tout appel externe', async () => {
  let called = false;
  const result = await assessAgriculturalFeasibility({
    project: { ...project, sowing_month: 13 }, input_items: inputItems,
    context: { city: 'Saint-Louis' },
  }, { baseUrl: 'https://teranga.example', fetchImpl: async () => { called = true; } });
  assert.equal(called, false);
  assert.equal(result.source.fallback_reason, 'insufficient_context');
});
