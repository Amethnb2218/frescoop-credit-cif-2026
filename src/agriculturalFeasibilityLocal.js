import {
  assessAgriculturalProject,
  AGRICULTURAL_RULES_VERSION,
} from '../shared/agriculturalAssessment.js';

export function buildLocalFeasibility(project = {}, inputItems = [], evidence = [], reason = 'offline') {
  const local = assessAgriculturalProject(project, inputItems, evidence);
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
    details: {
      missing_data: local.missing_data,
      findings: local.findings,
      recommendations: local.findings.map(item => item.action).filter(Boolean),
      external_signals: [],
      metrics: local.metrics,
      caveats: ['Analyse locale uniquement — Teranga sera consulté au retour du réseau.'],
    },
    source: {
      mode: 'local_offline',
      engine: 'frescoop-agronomic-feasibility',
      engine_version: 1,
      local_rules_version: AGRICULTURAL_RULES_VERSION,
      teranga: { attempted: false, available: false },
      fallback_used: true,
      fallback_reason: reason,
    },
    evaluated_at: new Date().toISOString(),
  };
}
