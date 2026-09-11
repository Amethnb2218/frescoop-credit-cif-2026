import * as feasibilityContract from '../shared/agriculturalFeasibilityContract.js';
import {
  assessAgriculturalProject,
  AGRICULTURAL_RULES_VERSION,
} from '../shared/agriculturalAssessment.js';

export function buildLocalFeasibility(project = {}, inputItems = [], evidence = [], reason = 'offline') {
  const local = assessAgriculturalProject(project, inputItems, evidence);
  let contract;
  if (typeof feasibilityContract.buildAgriculturalFeasibilityContract === 'function') {
    contract = feasibilityContract.buildAgriculturalFeasibilityContract({ local, project, inputItems, evidence });
  } else {
    const metrics = feasibilityContract.buildFeasibilityMetrics(local.metrics, project, [], {
      mode: 'local_offline', fallback_reason: reason,
    });
    contract = {
      metrics,
      report: {
        language: 'fr',
        narrative: feasibilityContract.buildFeasibilityReport({
          status: 'ADJUST', project, local, metrics,
          source: { mode: 'local_offline', fallback_reason: reason },
        }),
        assumptions: [],
        evidence: evidence.map(item => item.label || item.document_type || item.type || item.filename).filter(Boolean),
        missing_data: local.missing_data || [],
        risks: local.findings?.map(item => item.explanation).filter(Boolean) || [],
        benefits: [], gains: [], mini_table: [],
      },
    };
  }
  const metrics = {
    ...contract.metrics,
    declared_revenue: contract.metrics.revenue,
    revenue_adjustment: 0,
  };
  let status = 'FEASIBLE';
  if (local.adequacy_status === 'INCOMPATIBLE' || local.viability_status === 'NON_VIABLE') status = 'HUMAN_REVIEW';
  else if (local.adequacy_status !== 'ADEQUATE' || local.viability_status !== 'VIABLE' || local.findings.length > 0) status = 'ADJUST';
  const labels = {
    FEASIBLE: ['Faisable', 'Le projet est agronomiquement cohérent selon les données disponibles.'],
    ADJUST: ['À ajuster', 'Certains éléments du projet doivent être complétés, corrigés ou justifiés.'],
    HUMAN_REVIEW: ['Revue humaine', 'Le projet présente une incohérence importante qui nécessite une vérification humaine.'],
  };
  const notice = 'Rapport local déterministe conservé : Teranga AI sera consulté au retour du réseau.';
  return {
    status,
    label: labels[status][0],
    summary: labels[status][1],
    report: contract.report,
    details: {
      missing_data: contract.report.missing_data,
      findings: local.findings,
      recommendations: local.findings.map(item => item.action).filter(Boolean),
      external_signals: [],
      metrics,
      report: contract.report,
      risk: { safety_score: null, level: null, recommendation: null },
      caveats: [notice],
    },
    calculated_metrics: metrics,
    source: {
      mode: 'local_offline',
      contract_version: feasibilityContract.AGRICULTURAL_FEASIBILITY_CONTRACT_VERSION ?? 3,
      engine: 'frescoop-agronomic-feasibility',
      engine_version: feasibilityContract.AGRICULTURAL_FEASIBILITY_CONTRACT_VERSION ?? 3,
      local_rules_version: AGRICULTURAL_RULES_VERSION,
      teranga: {
        attempted: false, available: false, source: 'local', model: null,
        degraded: true, notice,
      },
      fallback_used: true,
      fallback_reason: reason,
    },
    evaluated_at: new Date().toISOString(),
  };
}
