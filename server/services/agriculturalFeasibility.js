import * as feasibilityContract from '../../shared/agriculturalFeasibilityContract.js';
import { assessAgriculturalProject, AGRICULTURAL_RULES_VERSION } from './agriculturalAssessment.js';

export const AGRICULTURAL_FEASIBILITY_VERSION = feasibilityContract.AGRICULTURAL_FEASIBILITY_CONTRACT_VERSION ?? 3;
const DEFAULT_TERANGA_BASE_URL = 'https://teranga-ai.onrender.com';
const DEFAULT_TIMEOUT_MS = 30000;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strictResponseNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function findResponseNumber(payload, paths) {
  for (const path of paths) {
    const value = strictResponseNumber(pickFirst(payload, [path]));
    if (value != null) return value;
  }
  return null;
}

function safeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function missingDataLabel(item) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return String(item ?? '');
  return item.label || item.message || item.field || item.code || 'donnée à compléter';
}

function terangaCropName(value) {
  const primaryCrop = safeText(value).split(/[,;/]/, 1)[0].trim();
  return primaryCrop.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function calculateRevenue(project, yieldKgHa) {
  const surface = finiteNumber(project.project_surface_ha);
  const losses = finiteNumber(project.loss_percent);
  const price = finiteNumber(project.expected_price);
  if (surface == null || surface <= 0 || yieldKgHa == null || yieldKgHa <= 0
    || losses == null || losses < 0 || losses > 100 || price == null || price < 0) return null;
  return Math.round(surface * yieldKgHa * (1 - losses / 100) * price);
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
    label: 'Faisable', summary: 'Le projet est agronomiquement cohérent selon les données disponibles.',
  };
  if (status === 'HUMAN_REVIEW') return {
    label: 'Revue humaine', summary: 'Le projet présente une incohérence importante qui nécessite une vérification humaine.',
  };
  return { label: 'À ajuster', summary: 'Certains éléments du projet doivent être complétés, corrigés ou justifiés.' };
}

function buildLegacyContract(local, project, inputItems, evidence, externalSignals, source, retainedYield) {
  const metrics = feasibilityContract.buildFeasibilityMetrics(
    local.metrics, project, externalSignals, { mode: retainedYield != null ? 'hybrid' : source.mode },
  );
  const itemTotal = inputItems.reduce((sum, item) => {
    const quantity = Math.max(0, finiteNumber(item.quantity) || 0);
    const unitCost = Math.max(0, finiteNumber(item.unit_cost) || 0);
    return sum + quantity * unitCost;
  }, 0);
  const ownContribution = Math.max(0, finiteNumber(project.own_contribution) || 0);
  const otherFunding = Math.max(0, finiteNumber(project.other_funding) || 0);
  const realNeed = Math.max(0, itemTotal - ownContribution - otherFunding);
  const principal = finiteNumber(project.amount_requested);
  const interestRate = finiteNumber(project.interest_rate_percent ?? project.interest_rate);
  const interestAmount = finiteNumber(project.interest_amount ?? project.credit_interest_amount)
    ?? (principal != null && interestRate != null ? Math.round(principal * interestRate / 100) : null);
  const totalDue = finiteNumber(project.total_due ?? project.credit_total_due)
    ?? (principal != null && interestAmount != null ? principal + interestAmount : null);
  const enrichedMetrics = {
    ...metrics,
    project_cost: itemTotal,
    real_financing_need: realNeed,
    financing_need: realNeed,
    overfinancing: principal == null ? null : Math.max(0, principal - realNeed),
    recommended_amount: principal == null ? realNeed : Math.min(principal, realNeed),
    interest_rate_percent: interestRate,
    interest_amount: interestAmount,
    total_due: totalDue,
    revenue: metrics.retained_revenue,
    stress_revenue_minus_20_percent: metrics.retained_revenue == null
      ? null : Math.round(metrics.retained_revenue * 0.8),
  };
  return {
    metrics: enrichedMetrics,
    report: {
      language: 'fr',
      narrative: `Le besoin réel est de ${Math.round(realNeed)} FCFA. ${feasibilityContract.buildFeasibilityReport({
        status: localStatus(local), project, local, metrics: enrichedMetrics, source,
      })}`,
      assumptions: [],
      evidence: evidence.map(item => item.label || item.document_type || item.type || item.filename).filter(Boolean),
      missing_data: local.missing_data,
      risks: local.findings.map(item => item.explanation).filter(Boolean),
      benefits: [],
      gains: [],
      mini_table: [],
    },
  };
}

function buildContract(local, project, inputItems, evidence, externalSignals, source) {
  const declaredYield = finiteNumber(project.expected_yield);
  const yieldSignal = externalSignals.find(signal => signal.type === 'yield');
  const terangaYield = yieldSignal?.predicted_yield_kg_ha ?? null;
  const externalAdjustmentAllowed = ['hybrid', 'hybrid_partial'].includes(source.mode) && terangaYield != null;
  const retainedYield = externalAdjustmentAllowed
    ? (declaredYield != null && declaredYield > 0 ? Math.min(declaredYield, terangaYield) : terangaYield)
    : declaredYield;
  const declaredRevenue = calculateRevenue(project, declaredYield);
  if (typeof feasibilityContract.buildAgriculturalFeasibilityContract === 'function') {
    const contract = feasibilityContract.buildAgriculturalFeasibilityContract({
      local, project, inputItems, evidence, retainedYield, terangaYield,
      externalAdjustmentApplied: externalAdjustmentAllowed && retainedYield !== declaredYield,
    });
    return {
      ...contract,
      metrics: {
        ...contract.metrics,
        declared_revenue: declaredRevenue,
        retained_revenue: contract.metrics.revenue,
        revenue_adjustment: declaredRevenue == null || contract.metrics.revenue == null
          ? null : contract.metrics.revenue - declaredRevenue,
      },
    };
  }
  return buildLegacyContract(
    local, project, inputItems, evidence, externalSignals, source,
    externalAdjustmentAllowed ? retainedYield : null,
  );
}

export function summarizeAgriculturalFeasibility(
  local, externalSignals = [], source = {}, project = {}, inputItems = [], evidence = [],
) {
  let status = localStatus(local);
  if (externalSignals.some(signal => signal.level === 'conflict')) status = 'HUMAN_REVIEW';
  else if (status === 'FEASIBLE' && externalSignals.some(signal => ['high', 'moderate'].includes(signal.level))) status = 'ADJUST';
  const text = statusText(status);
  const recommendations = local.findings.map(item => item.action).filter(Boolean);
  const contract = buildContract(local, project, inputItems, evidence, externalSignals, source);
  const risk = externalSignals.find(signal => signal.type === 'risk');
  const teranga = {
    attempted: false, available: false, source: 'local', model: null, degraded: false, notice: null,
    ...(source.teranga || {}),
  };
  const caveats = [];
  if (local.confidence_level === 'LOW') caveats.push('Résultat indicatif à confirmer avec les preuves du dossier.');
  if (teranga.notice) caveats.push(teranga.notice);
  return {
    status, ...text,
    report: contract.report,
    details: {
      missing_data: contract.report.missing_data,
      findings: local.findings,
      recommendations,
      external_signals: externalSignals,
      metrics: contract.metrics,
      report: contract.report,
      risk: {
        safety_score: risk?.safety_score ?? null,
        level: risk?.level ?? null,
        recommendation: risk?.recommendation ?? null,
      },
      caveats,
    },
    calculated_metrics: contract.metrics,
    source: {
      mode: source.mode || 'local_offline',
      contract_version: AGRICULTURAL_FEASIBILITY_VERSION,
      engine: 'frescoop-agronomic-feasibility',
      engine_version: AGRICULTURAL_FEASIBILITY_VERSION,
      local_rules_version: AGRICULTURAL_RULES_VERSION,
      teranga,
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
  const predicted = findResponseNumber(payload, [
    'predicted_yield_kg_ha', 'predicted_yield_kg', 'prediction.ensemble_kg',
    'ensemble.predicted_yield_kg_ha', 'ensemble.predicted_yield_kg',
    'result.predicted_yield_kg_ha', 'result.predicted_yield_kg',
    'data.predicted_yield_kg_ha', 'data.predicted_yield_kg',
  ]);
  if (predicted == null || predicted <= 0 || predicted > 50000) return null;
  const expected = finiteNumber(expectedYield);
  const signal = {
    type: 'yield', predicted_yield_kg_ha: predicted, level: 'information',
    explanation: `Rendement Teranga indicatif : ${Math.round(predicted)} kg/ha.`,
  };
  if (!expected || expected <= 0) return signal;
  if (predicted / expected < 0.6) return {
    ...signal, level: 'conflict',
    explanation: `Le rendement Teranga (${Math.round(predicted)} kg/ha) est nettement inférieur à l'hypothèse saisie.`,
  };
  return { ...signal, level: 'coherent', explanation: "L'ordre de grandeur Teranga est cohérent avec l'hypothèse saisie." };
}

export function normalizeRiskResponse(payload) {
  const safetyScore = findResponseNumber(payload, [
    'safety_score', 'safetyScore',
    'result.safety_score', 'result.safetyScore',
    'data.safety_score', 'data.safetyScore',
  ]);
  const rawLevel = safeText(pickFirst(payload, [
    'niveau', 'level', 'risk_level',
    'result.niveau', 'result.level', 'result.risk_level',
    'data.niveau', 'data.level', 'data.risk_level',
  ])).toLowerCase();
  const recommendation = safeText(pickFirst(payload, [
    'recommandation', 'recommendation',
    'result.recommandation', 'result.recommendation',
    'data.recommandation', 'data.recommendation',
  ]));
  let level = rawLevel;
  if (!level && safetyScore != null) {
    level = safetyScore >= 75 ? 'information' : safetyScore >= 50 ? 'moderate' : 'high';
  }
  if (safetyScore == null || safetyScore < 0 || safetyScore > 100
    || !['high', 'moderate', 'information'].includes(level) || !recommendation) return null;
  return { type: 'risk', safety_score: safetyScore, level, recommendation, explanation: recommendation };
}

export function normalizeChatResponse(payload) {
  const message = safeText(pickFirst(payload, [
    'message', 'text', 'content', 'response.message', 'response.text', 'response.content',
    'result.message', 'result.text', 'data.message', 'data.text',
  ]));
  if (!message) return null;
  return {
    message,
    source: safeText(pickFirst(payload, ['source', 'response.source', 'result.source', 'data.source'])) || 'teranga',
    model: safeText(pickFirst(payload, ['model', 'response.model', 'result.model', 'data.model'])) || null,
    degraded: pickFirst(payload, ['degraded', 'response.degraded', 'result.degraded', 'data.degraded']) === true,
    notice: safeText(pickFirst(payload, ['notice', 'response.notice', 'result.notice', 'data.notice'])) || null,
  };
}

function buildChatMessages(project, inputItems, local) {
  const budget = inputItems.reduce((sum, item) => {
    const quantity = Math.max(0, finiteNumber(item.quantity) || 0);
    const unitCost = Math.max(0, finiteNumber(item.unit_cost) || 0);
    return sum + quantity * unitCost;
  }, 0);
  return [
    {
      role: 'system',
      content: "Tu es Teranga, conseiller agricole. Réponds en français avec un rapport narratif concis. N'invente aucun chiffre et signale les hypothèses, preuves, données manquantes, risques, bénéfices et gains.",
    },
    {
      role: 'user',
      content: [
        `Projet : culture ${safeText(project.crop_label) || 'non renseignée'}, zone ${safeText(project.agro_zone) || 'non renseignée'}, surface ${finiteNumber(project.project_surface_ha) ?? 'non renseignée'} ha.`,
        `Budget : coût ${Math.round(budget)} FCFA, apport ${finiteNumber(project.own_contribution) ?? 'non renseigné'} FCFA, autres financements ${finiteNumber(project.other_funding) ?? 'non renseignés'} FCFA.`,
        `Crédit : montant demandé ${finiteNumber(project.amount_requested) ?? 'non renseigné'} FCFA, taux ${finiteNumber(project.interest_rate_percent ?? project.interest_rate) ?? 'non renseigné'} %, total dû ${finiteNumber(project.total_due ?? project.credit_total_due) ?? 'non renseigné'} FCFA.`,
        `Données manquantes locales : ${(local.missing_data || []).map(missingDataLabel).filter(Boolean).join(', ') || 'aucune signalée'}.`,
      ].join('\n'),
    },
  ];
}

async function fetchJson(url, fetchImpl, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.headers || {}) },
    });
    if (!response.ok) throw new Error(`http_${response.status}`);
    try {
      return await response.json();
    } catch (error) {
      error.code = 'INVALID_RESPONSE';
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

function reasonFor(results) {
  if (results.some(result => result.status === 'rejected' && result.reason?.name === 'AbortError')) return 'timeout';
  if (results.some(result => result.status === 'fulfilled' || result.reason?.code === 'INVALID_RESPONSE')) return 'invalid_response';
  return 'unavailable';
}

function fallbackNotice(reason) {
  const labels = {
    not_configured: "Teranga n'est pas configuré.",
    insufficient_context: "Le contexte requis par Teranga est incomplet.",
    timeout: "Teranga n'a pas répondu dans le délai imparti.",
    invalid_response: 'La réponse Teranga est invalide ou incomplète.',
    unavailable: 'Teranga est indisponible.',
    partial_response: 'Teranga a répondu partiellement.',
  };
  return `${labels[reason] || 'Teranga est indisponible.'} Le rapport local déterministe est conservé.`;
}

export async function assessAgriculturalFeasibility(input = {}, options = {}) {
  const project = input.project || {};
  const inputItems = Array.isArray(input.input_items) ? input.input_items : [];
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const local = assessAgriculturalProject(project, inputItems, evidence);
  const requestedBaseUrl = Object.prototype.hasOwnProperty.call(options, 'baseUrl')
    ? options.baseUrl
    : process.env.TERANGA_BASE_URL || DEFAULT_TERANGA_BASE_URL;
  const baseUrl = String(requestedBaseUrl ?? '').replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = finiteNumber(options.timeoutMs ?? process.env.TERANGA_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const city = safeText(input.context?.city || input.context?.location || project.agro_zone).replace(/\s*\([^)]*\)\s*$/, '');
  const month = finiteNumber(project.sowing_month);
  const crop = terangaCropName(project.crop_label);
  if (!baseUrl || !fetchImpl || !city || !crop || month == null || month < 1 || month > 12) {
    const reason = !baseUrl ? 'not_configured' : 'insufficient_context';
    const notice = fallbackNotice(reason);
    return summarizeAgriculturalFeasibility(local, [], {
      mode: 'local_offline', fallback_used: true, fallback_reason: reason,
      teranga: { attempted: false, available: false, source: 'local', model: null, degraded: true, notice },
    }, project, inputItems, evidence);
  }
  const encodedCrop = encodeURIComponent(crop.toLowerCase());
  const encodedCity = encodeURIComponent(city.toLowerCase());
  const requests = [
    fetchJson(`${baseUrl}/api/ml/predict-yield/${encodedCrop}/${encodedCity}?month=${month}`, fetchImpl, timeoutMs),
    fetchJson(`${baseUrl}/api/ml/risk/${encodedCrop}/${encodedCity}/${month}`, fetchImpl, timeoutMs),
    fetchJson(`${baseUrl}/api/chat`, fetchImpl, timeoutMs, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: buildChatMessages(project, inputItems, local), language: 'fr' }),
    }),
  ];
  const results = await Promise.allSettled(requests);
  const yieldSignal = results[0].status === 'fulfilled'
    ? normalizeYieldResponse(results[0].value, project.expected_yield) : null;
  const riskSignal = results[1].status === 'fulfilled' ? normalizeRiskResponse(results[1].value) : null;
  const chat = results[2].status === 'fulfilled' ? normalizeChatResponse(results[2].value) : null;
  const signals = [yieldSignal, riskSignal].filter(Boolean);
  const validResponses = [yieldSignal, riskSignal, chat].filter(Boolean).length;
  if (validResponses === 0) {
    const reason = reasonFor(results);
    const notice = fallbackNotice(reason);
    return summarizeAgriculturalFeasibility(local, [], {
      mode: 'local_fallback', fallback_used: true, fallback_reason: reason,
      teranga: { attempted: true, available: false, source: 'local', model: null, degraded: true, notice },
    }, project, inputItems, evidence);
  }
  const allValid = validResponses === 3;
  const reason = allValid ? null : 'partial_response';
  const partialNotice = allValid ? '' : fallbackNotice(reason);
  const notice = allValid
    ? chat.notice
    : [partialNotice, chat?.notice].filter(Boolean).join(' ');
  const terangaSource = chat?.source || 'teranga';
  const result = summarizeAgriculturalFeasibility(local, signals, {
    mode: allValid ? 'hybrid' : 'hybrid_partial',
    fallback_used: !allValid,
    fallback_reason: reason,
    teranga: {
      attempted: true,
      available: true,
      source: terangaSource,
      model: chat?.model ?? null,
      degraded: !allValid || Boolean(chat?.degraded),
      notice,
      ...(chat ? { message: chat.message } : {}),
      adapter_version: 3,
    },
  }, project, inputItems, evidence);
  if (chat) {
    result.report = { ...result.report, teranga_narrative: chat.message };
    result.details.report = result.report;
  }
  return result;
}
