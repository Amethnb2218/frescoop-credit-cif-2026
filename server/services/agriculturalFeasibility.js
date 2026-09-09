import { assessAgriculturalProject, AGRICULTURAL_RULES_VERSION } from './agriculturalAssessment.js';

export const AGRICULTURAL_FEASIBILITY_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 2500;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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

export function summarizeAgriculturalFeasibility(local, externalSignals = [], source = {}) {
  let status = localStatus(local);
  if (externalSignals.some(signal => signal.level === 'conflict')) status = 'HUMAN_REVIEW';
  else if (status === 'FEASIBLE' && externalSignals.some(signal => ['high', 'moderate'].includes(signal.level))) status = 'ADJUST';
  const text = statusText(status);
  const recommendations = local.findings.map(item => item.action).filter(Boolean);

  return {
    status,
    ...text,
    details: {
      missing_data: local.missing_data,
      findings: local.findings,
      recommendations,
      external_signals: externalSignals,
      metrics: local.metrics,
      caveats: local.confidence_level === 'LOW'
        ? ['Résultat indicatif à confirmer avec les preuves du dossier.']
        : [],
    },
    source: {
      mode: source.mode || 'local',
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
  const predicted = finiteNumber(pickFirst(payload, [
    'ensemble.predicted_yield_kg', 'predictedYield', 'predicted_yield', 'prediction', 'yield',
    'result.predictedYield', 'result.predicted_yield', 'data.predictedYield', 'data.predicted_yield',
  ]));
  if (predicted == null || predicted <= 0 || predicted > 50000) return null;
  const unit = safeText(pickFirst(payload, ['unit', 'yieldUnit', 'yield_unit', 'result.unit', 'data.unit'])).toLowerCase();
  let kgPerHa = predicted;
  if (unit.includes('t/ha') || unit.includes('tonne')) kgPerHa *= 1000;
  else if (unit && !unit.includes('kg') && !unit.includes('ha')) return null;
  const expected = finiteNumber(expectedYield);
  if (!expected || expected <= 0) return {
    type: 'yield', level: 'information', explanation: `Rendement Teranga indicatif : ${Math.round(kgPerHa)} kg/ha.`,
  };
  const ratio = kgPerHa / expected;
  if (ratio < 0.6) return {
    type: 'yield', level: 'conflict', explanation: `Le rendement Teranga (${Math.round(kgPerHa)} kg/ha) est nettement inférieur à l'hypothèse saisie.`,
  };
  return {
    type: 'yield', level: 'coherent', explanation: "L'ordre de grandeur Teranga est cohérent avec l'hypothèse saisie.",
  };
}

export function normalizeRiskResponse(payload) {
  const safetyScore = finiteNumber(pickFirst(payload, [
    'safetyScore', 'safety_score', 'result.safetyScore', 'result.safety_score',
    'data.safetyScore', 'data.safety_score',
  ]));
  const recommendation = safeText(pickFirst(payload, [
    'recommendation', 'explanation', 'message', 'result.recommendation',
    'result.explanation', 'data.recommendation', 'data.explanation',
  ]));
  if (safetyScore == null || safetyScore < 0 || safetyScore > 100) return null;
  const level = safetyScore < 50 ? 'high' : safetyScore < 75 ? 'moderate' : 'information';
  return {
    type: 'risk',
    level,
    explanation: recommendation || `Risque agronomique Teranga : indice de sécurité ${Math.round(safetyScore)}/100.`,
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
      mode: 'local', fallback_used: true, fallback_reason: reason,
      teranga: { attempted: false, available: false },
    });
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
    });
  }
  return summarizeAgriculturalFeasibility(local, signals, {
    mode: successful === results.length ? 'hybrid' : 'hybrid_partial',
    fallback_used: successful !== results.length,
    fallback_reason: successful !== results.length ? 'partial_response' : null,
    teranga: { attempted: true, available: true, adapter_version: 1 },
  });
}
