import {
  assessAgriculturalProject,
  AGRICULTURAL_RULES_VERSION,
} from '../shared/agriculturalAssessment.js';
import {
  buildFeasibilityMetrics,
  buildFeasibilityReport,
  feasibilityReasonMessage,
} from '../shared/agriculturalFeasibilityContract.js';

export function buildLocalFeasibility(project = {}, inputItems = [], evidence = [], reason = 'offline') {
  const local = assessAgriculturalProject(project, inputItems, evidence);
  const attempted = ['timeout', 'invalid_response', 'unavailable', 'partial_response'].includes(reason);
  const source = {
    mode: attempted ? 'local_fallback' : 'local',
    contract_version: 3,
    engine: 'frescoop-agronomic-feasibility',
    engine_version: 3,
    local_rules_version: AGRICULTURAL_RULES_VERSION,
    teranga: { attempted, available: false },
    fallback_used: attempted,
    fallback_reason: reason,
  };
  const metrics = buildFeasibilityMetrics(local.metrics, project, [], source);
  let status = 'FEASIBLE';
  if (local.adequacy_status === 'INCOMPATIBLE' || local.viability_status === 'NON_VIABLE') status = 'HUMAN_REVIEW';
  else if (local.adequacy_status !== 'ADEQUATE' || local.viability_status !== 'VIABLE' || local.findings.length > 0) status = 'ADJUST';
  const labels = {
    FEASIBLE: ['Faisable', 'Le projet est agronomiquement cohérent selon les données disponibles.'],
    ADJUST: ['À ajuster', 'Certains éléments du projet doivent être complétés, corrigés ou justifiés.'],
    HUMAN_REVIEW: ['Revue humaine', 'Le projet présente une incohérence importante qui nécessite une vérification humaine.'],
  };
  return {
    status,
    label: labels[status][0],
    summary: labels[status][1],
    report: buildFeasibilityReport({ status, project, local, metrics, source }),
    details: {
      missing_data: local.missing_data,
      findings: local.findings,
      recommendations: local.findings.map(item => item.action).filter(Boolean),
      external_signals: [],
      metrics,
      risk: { safety_score: null, level: null, recommendation: null },
      caveats: [feasibilityReasonMessage(reason)],
    },
    calculated_metrics: metrics,
    source,
    evaluated_at: new Date().toISOString(),
  };
}
