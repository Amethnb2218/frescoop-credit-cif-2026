import { assessAgriculturalProject, AGRICULTURAL_RULES_VERSION } from './agriculturalAssessment.js';

export const AGRICULTURAL_FEASIBILITY_VERSION = 2;
const DEFAULT_TIMEOUT_MS = 2500;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strictResponseNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function calculateRevenue(project, yieldKgHa) {
  const surface = finiteNumber(project.project_surface_ha);
  const losses = finiteNumber(project.loss_percent);
  const price = finiteNumber(project.expected_price);
  if (surface == null || surface <= 0 || yieldKgHa == null || yieldKgHa <= 0
    || losses == null || losses < 0 || losses > 100 || price == null || price < 0) return null;
  return Math.round(surface * yieldKgHa * (1 - losses / 100) * price);
}

function buildContractMetrics(local, project, externalSignals, source) {
  const declaredYield = finiteNumber(project.expected_yield);
  const yieldSignal = externalSignals.find(signal => signal.type === 'yield');
  const terangaYield = yieldSignal?.predicted_yield_kg_ha ?? null;
  const externalAdjustmentAllowed = source.mode === 'hybrid' && terangaYield != null;
  const retainedYield = externalAdjustmentAllowed
    ? (declaredYield != null && declaredYield > 0 ? Math.min(declaredYield, terangaYield) : terangaYield)
    : declaredYield;
  const declaredRevenue = calculateRevenue(project, declaredYield);
  const retainedRevenue = calculateRevenue(project, retainedYield);
  return {
    ...local.metrics,
    project_surface_ha: finiteNumber(project.project_surface_ha),
    surface_ha: finiteNumber(project.project_surface_ha),
    expected_price: finiteNumber(project.expected_price),
    price: finiteNumber(project.expected_price),
    loss_percent: finiteNumber(project.loss_percent),
    declared_yield: declaredYield,
    teranga_yield: terangaYield,
    predicted_yield_kg_ha: terangaYield,
    retained_yield: retainedYield,
    declared_revenue: declaredRevenue,
    retained_revenue: retainedRevenue,
    revenue_adjustment: declaredRevenue == null || retainedRevenue == null
      ? null : retainedRevenue - declaredRevenue,
    external_adjustment_applied: externalAdjustmentAllowed && retainedYield !== declaredYield,
  };
}

function localStatus(local) {
  if (local.adequacy_status === 'INCOMPATIBLE' || local.viability_status === 'NON_VIABLE') return 'HUMAN_REVIEW';
  if (local.adequacy_status === 'INSUFFICIENT_DATA' || local.viability_status === 'INSUFFICIENT_DATA'
    || local.adequacy_status === 'ATTENTION' || local.viability_status === 'FRAGILE'
    || local.findings.length > 0) return 'ADJUST';
  return 'FEASIBLE';
}

function statusText(status) {
  if (status === 'FEASIBLE') return {
    label: 'Faisable',
    summary: 'Le projet est agronomiquement cohérent selon les données disponibles.',
  };
  if (status === 'HUMAN_REVIEW') return {
    label: 'Revue humaine',
    summary: 'Le projet présente une incohérence importante qui nécessite une vérification humaine.',
  };
  return {
    label: 'À ajuster',
    summary: 'Certains éléments du projet doivent être complétés, corrigés ou justifiés.',
  };
}

export function summarizeAgriculturalFeasibility(local, externalSignals = [], source = {}, project = {}) {
  let status = localStatus(local);
  if (externalSignals.some(signal => signal.level === 'conflict')) status = 'HUMAN_REVIEW';
  else if (status === 'FEASIBLE' && externalSignals.some(signal => ['high', 'moderate'].includes(signal.level))) status = 'ADJUST';
  const text = statusText(status);
  const recommendations = local.findings.map(item => item.action).filter(Boolean);
  const metrics = buildContractMetrics(local, project, externalSignals, source);
  const risk = externalSignals.find(signal => signal.type === 'risk');

  return {
    status,
    ...text,
    details: {
      missing_data: local.missing_data,
      findings: local.findings,
      recommendations,
      external_signals: externalSignals,
      metrics,
      risk: {
        safety_score: risk?.safety_score ?? null,
        level: risk?.level ?? null,
        recommendation: risk?.recommendation ?? null,
      },
      caveats: local.confidence_level === 'LOW'
        ? ['Résultat indicatif à confirmer avec les preuves du dossier.']
        : [],
    },
    calculated_metrics: metrics,
    source: {
      mode: source.mode || 'local_offline',
      contract_version: AGRICULTURAL_FEASIBILITY_VERSION,
      engine: 'frescoop-agronomic-feasibility',
      engine_version: AGRICULTURAL_FEASIBILITY_VERSION,
      local_rules_version: AGRICULTURAL_RULES_VERSION,
      teranga: source.teranga || { attempted: false, available: false },
      fallback_used: Boolean(source.fallback_used),
      fallback_reason: source.fallback_reason || null,
    },
    evaluated_at: new Date().toISOString(),
  };
}

function pickFirst(object, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => current?.[key], object);
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

export function normalizeYieldResponse(payload, expectedYield) {
  const predicted = strictResponseNumber(pickFirst(payload, [
    'predicted_yield_kg_ha', 'ensemble.predicted_yield_kg_ha',
    'result.predicted_yield_kg_ha', 'data.predicted_yield_kg_ha',
  ]));
  if (predicted == null || predicted <= 0 || predicted > 50000) return null;
  const expected = finiteNumber(expectedYield);
  const signal = {
    type: 'yield',
    predicted_yield_kg_ha: predicted,
    level: 'information',
    explanation: `Rendement Teranga indicatif : ${Math.round(predicted)} kg/ha.`,
  };
  if (!expected || expected <= 0) return signal;
  if (predicted / expected < 0.6) return {
    ...signal,
    level: 'conflict',
    explanation: `Le rendement Teranga (${Math.round(predicted)} kg/ha) est nettement inférieur à l'hypothèse saisie.`,
  };
  return {
    ...signal,
    level: 'coherent',
    explanation: "L'ordre de grandeur Teranga est cohérent avec l'hypothèse saisie.",
  };
}

export function normalizeRiskResponse(payload) {
  const safetyScore = strictResponseNumber(pickFirst(payload, [
    'safety_score', 'result.safety_score', 'data.safety_score',
  ]));
  const level = safeText(pickFirst(payload, [
    'niveau', 'result.niveau', 'data.niveau',
  ])).toLowerCase();
  const recommendation = safeText(pickFirst(payload, [
    'recommandation', 'result.recommandation', 'data.recommandation',
  ]));
  if (safetyScore == null || safetyScore < 0 || safetyScore > 100
    || !['high', 'moderate', 'information'].includes(level) || !recommendation) return null;
  return {
    type: 'risk',
    safety_score: safetyScore,
    level,
    recommendation,
    explanation: recommendation,
  };
}

async function fetchJson(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`http_${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function assessAgriculturalFeasibility(input = {}, options = {}) {
  const project = input.project || {};
  const inputItems = Array.isArray(input.input_items) ? input.input_items : [];
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const local = assessAgriculturalProject(project, inputItems, evidence);
  const baseUrl = String(options.baseUrl ?? process.env.TERANGA_BASE_URL ?? '').replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = finiteNumber(options.timeoutMs ?? process.env.TERANGA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const city = safeText(input.context?.city || input.context?.location || project.agro_zone).replace(/\s*\([^)]*\)\s*$/, '');
  const month = finiteNumber(project.sowing_month);
  const crop = safeText(project.crop_label);

  if (!baseUrl || !fetchImpl || !city || !crop || month == null || month < 1 || month > 12) {
    const reason = !baseUrl ? 'not_configured' : 'insufficient_context';
    return summarizeAgriculturalFeasibility(local, [], {
      mode: 'local_offline', fallback_used: true, fallback_reason: reason,
      teranga: { attempted: false, available: false },
    }, project);
  }

  const encodedCrop = encodeURIComponent(crop.toLowerCase());
  const encodedCity = encodeURIComponent(city.toLowerCase());
  const urls = [
    `${baseUrl}/api/ml/predict-yield/${encodedCrop}/${encodedCity}?month=${month}`,
    `${baseUrl}/api/ml/risk/${encodedCrop}/${encodedCity}/${month}`,
  ];
  const results = await Promise.allSettled(urls.map(url => fetchJson(url, fetchImpl, timeoutMs)));
  const normalized = [
    results[0].status === 'fulfilled'
      ? normalizeYieldResponse(results[0].value, project.expected_yield) : null,
    results[1].status === 'fulfilled' ? normalizeRiskResponse(results[1].value) : null,
  ];
  const signals = normalized.filter(Boolean);
  const successful = signals.length;
  if (successful === 0) {
    const aborted = results.some(result => result.reason?.name === 'AbortError');
    const invalid = results.some(result => result.status === 'fulfilled');
    return summarizeAgriculturalFeasibility(local, [], {
      mode: 'local_fallback', fallback_used: true,
      fallback_reason: aborted ? 'timeout' : invalid ? 'invalid_response' : 'unavailable',
      teranga: { attempted: true, available: false },
    }, project);
  }
  return summarizeAgriculturalFeasibility(local, signals, {
    mode: successful === results.length ? 'hybrid' : 'hybrid_partial',
    fallback_used: successful !== results.length,
    fallback_reason: successful !== results.length ? 'partial_response' : null,
    teranga: { attempted: true, available: true, adapter_version: 2 },
  }, project);
}
