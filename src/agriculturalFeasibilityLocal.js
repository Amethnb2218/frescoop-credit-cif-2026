import {
  assessAgriculturalProject,
  AGRICULTURAL_RULES_VERSION,
} from '../shared/agriculturalAssessment.js';

export function buildLocalFeasibility(project = {}, inputItems = [], evidence = [], reason = 'offline') {
  const local = assessAgriculturalProject(project, inputItems, evidence);
  const surface = Math.max(0, Number(project.project_surface_ha || 0));
  const declaredYield = Math.max(0, Number(project.expected_yield || 0));
  const price = Math.max(0, Number(project.expected_price || 0));
  const lossPercent = Math.min(100, Math.max(0, Number(project.loss_percent || 0)));
  const declaredRevenue = Math.round(surface * declaredYield * (1 - lossPercent / 100) * price);
  const hybridMetrics = {
    ...local.metrics,
    project_surface_ha: surface,
    surface_ha: surface,
    expected_price: price,
    price,
    loss_percent: lossPercent,
    declared_yield: declaredYield,
    teranga_yield: null,
    predicted_yield_kg_ha: null,
    retained_yield: declaredYield,
    declared_revenue: declaredRevenue,
    retained_revenue: declaredRevenue,
    revenue_adjustment: 0,
    external_adjustment_applied: false,
  };
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
      metrics: hybridMetrics,
      risk: {
        safety_score: null,
        level: null,
        recommendation: null,
      },
      caveats: ['Analyse locale uniquement — Teranga AI sera consulté au retour du réseau.'],
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
