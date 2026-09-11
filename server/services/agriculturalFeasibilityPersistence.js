import { randomUUID } from 'crypto';

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strictTerangaYield(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 50000
    ? value
    : null;
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null);
}

function firstObject(...values) {
  return values.find(value => value && typeof value === 'object' && !Array.isArray(value)) || {};
}

export function agriculturalFeasibilityRecord(analysis = {}) {
  const metrics = firstObject(analysis.metrics, analysis.details?.metrics, analysis.calculated_metrics);
  const yieldSignal = (analysis.details?.external_signals || analysis.external_signals || [])
    .find(signal => signal?.type === 'yield');
  const signalRisk = (analysis.details?.external_signals || analysis.external_signals || [])
    .find(signal => signal?.type === 'risk');
  const risk = firstObject(analysis.risk, analysis.details?.risk, signalRisk);
  const source = firstObject(analysis.source);
  return {
    feasibility_status: firstDefined(analysis.status, analysis.feasibility_status) || null,
    feasibility_mode: firstDefined(source.mode, analysis.mode, analysis.feasibility_mode) || 'local',
    teranga_yield: strictTerangaYield(yieldSignal?.predicted_yield_kg_ha),
    retained_yield: numberOrNull(firstDefined(metrics.retained_yield, analysis.retained_yield)),
    declared_revenue: numberOrNull(firstDefined(metrics.declared_revenue, analysis.declared_revenue)),
    retained_revenue: numberOrNull(firstDefined(metrics.retained_revenue, analysis.retained_revenue)),
    safety_score: numberOrNull(firstDefined(risk.safety_score, risk.score, analysis.safety_score)),
    risk_level: firstDefined(risk.level, risk.risk_level, analysis.risk_level) || null,
    fallback_reason: firstDefined(source.fallback_reason, analysis.fallback_reason) || null,
    feasibility_version: numberOrNull(firstDefined(
      analysis.version, source.feasibility_version, source.hybrid_version,
      source.engine_version, source.contract_version,
    )),
    feasibility_analysis: JSON.stringify(analysis || {}),
  };
}

export function agriculturalAssessmentStatement({
  dossierId,
  tenantId,
  project = {},
  local = {},
  analysis = {},
  feasibility = agriculturalFeasibilityRecord(analysis),
  id = randomUUID(),
}) {
  return {
    sql: `INSERT INTO agricultural_project_assessments (
      id, dossier_id, tenant_id, crop_code, crop_label, variety, crop_experience_years,
      completed_campaigns, previous_campaign_result, project_surface_ha, land_access,
      agro_zone, soil_type, soil_source, season, sowing_month, harvest_month,
      cultivation_mode, water_source, water_reliability, expected_yield, expected_price,
      loss_percent, own_contribution, other_funding, market_channel, expected_buyer,
      climate_risks, mitigations, adequacy_status, viability_status, confidence_level,
      orientation, calculated_metrics, findings, rules_version, evaluated_at,
      feasibility_status, feasibility_mode, teranga_yield, retained_yield,
      declared_revenue, retained_revenue, safety_score, risk_level,
      fallback_reason, feasibility_version, feasibility_analysis)
      VALUES (${Array.from({ length: 48 }, () => '?').join(', ')})`,
    args: [
      id, dossierId, tenantId, project.crop_code || null, project.crop_label || null,
      project.variety || null, nullableNonNegative(project.crop_experience_years),
      nullableNonNegative(project.completed_campaigns), project.previous_campaign_result || null,
      nullableNonNegative(project.project_surface_ha), project.land_access || null,
      project.agro_zone || null, project.soil_type || null, project.soil_source || null,
      project.season || null, nullableNumber(project.sowing_month), nullableNumber(project.harvest_month),
      project.cultivation_mode || null, project.water_source || null,
      project.water_reliability || null, nullableNonNegative(project.expected_yield),
      nullableNonNegative(project.expected_price), nullableNonNegative(project.loss_percent),
      nullableNonNegative(project.own_contribution), nullableNonNegative(project.other_funding),
      project.market_channel || null, project.expected_buyer || null,
      JSON.stringify(project.climate_risks || []), JSON.stringify(project.mitigations || []),
      local.adequacy_status || null, local.viability_status || null, local.confidence_level || null,
      local.orientation || null, JSON.stringify(local.metrics || {}), JSON.stringify(local.findings || []),
      local.rules_version || null, analysis.evaluated_at || new Date().toISOString(),
      feasibility.feasibility_status, feasibility.feasibility_mode, feasibility.teranga_yield,
      feasibility.retained_yield, feasibility.declared_revenue, feasibility.retained_revenue,
      feasibility.safety_score, feasibility.risk_level, feasibility.fallback_reason,
      feasibility.feasibility_version, feasibility.feasibility_analysis,
    ],
  };
}

function nullableNonNegative(value) {
  const parsed = numberOrNull(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function nullableNumber(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
