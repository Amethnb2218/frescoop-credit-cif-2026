import { calculateLoanTerms } from './creditCalculations.js';

export const AGRICULTURAL_FEASIBILITY_CONTRACT_VERSION = 3;

const REASON_MESSAGES = {
  offline: 'navigateur hors ligne',
  not_configured: 'service Teranga non configuré',
  insufficient_context: 'culture, ville ou mois de semis manquant',
  timeout: 'délai de réponse Teranga dépassé',
  invalid_response: 'réponse Teranga invalide',
  unavailable: 'échec de la consultation Teranga',
  partial_response: 'réponse Teranga partielle',
};

export function feasibilityReasonMessage(reason) {
  return REASON_MESSAGES[reason] || 'aucune réponse externe valide';
}

export function agriculturalNumber(value, { positive = false } = {}) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (positive ? parsed <= 0 : parsed < 0) return null;
  return parsed;
}

function production(project, yieldKgHa) {
  const surface = agriculturalNumber(project.project_surface_ha, { positive: true });
  const losses = agriculturalNumber(project.loss_percent);
  if (surface == null || yieldKgHa == null || yieldKgHa <= 0
    || losses == null || losses > 100) return { gross: null, saleable: null };
  const gross = surface * yieldKgHa;
  return { gross, saleable: gross * (1 - losses / 100) };
}

function revenue(project, saleableProduction) {
  const price = agriculturalNumber(project.expected_price);
  return price == null || saleableProduction == null
    ? null
    : Math.round(saleableProduction * price);
}

export function buildFeasibilityMetrics(localMetrics = {}, project = {}, externalSignals = [], source = {}, financial = {}) {
  const declaredYield = agriculturalNumber(project.expected_yield, { positive: true });
  const yieldSignal = externalSignals.find(signal => signal?.type === 'yield');
  const terangaYield = yieldSignal && typeof yieldSignal.predicted_yield_kg_ha === 'number'
    && Number.isFinite(yieldSignal.predicted_yield_kg_ha) && yieldSignal.predicted_yield_kg_ha > 0
    ? yieldSignal.predicted_yield_kg_ha
    : null;
  const adjustmentAllowed = source.mode === 'hybrid' && terangaYield != null;
  const retainedYield = adjustmentAllowed
    ? (declaredYield == null ? terangaYield : Math.min(declaredYield, terangaYield))
    : declaredYield;
  const declaredProduction = production(project, declaredYield);
  const retainedProduction = production(project, retainedYield);
  const declaredRevenue = revenue(project, declaredProduction.saleable);
  const retainedRevenue = revenue(project, retainedProduction.saleable);
  const budgetTotal = agriculturalNumber(localMetrics.budget_total);
  const ownContribution = agriculturalNumber(project.own_contribution) ?? 0;
  const otherFunding = agriculturalNumber(project.other_funding) ?? 0;
  const declaredFinancingNeed = agriculturalNumber(localMetrics.financing_gap);
  const financingNeed = declaredFinancingNeed
    ?? (budgetTotal == null ? null : Math.max(0, budgetTotal - ownContribution - otherFunding));
  const credit = {
    ...financial.credit,
    amount_requested: financial.credit?.amount_requested ?? project.amount_requested,
  };
  const loanTerms = calculateLoanTerms(credit);
  const requestedAmount = loanTerms.principal;
  const recommendedAmount = financingNeed == null ? null : Math.min(requestedAmount, financingNeed);
  const financingDifference = financingNeed == null ? null : requestedAmount - financingNeed;
  const overfinancing = financingDifference == null ? null : Math.max(0, financingDifference);
  const remainingFinancingGap = financingDifference == null ? null : Math.max(0, -financingDifference);
  const projectMargin = retainedRevenue == null || budgetTotal == null ? null : retainedRevenue - budgetTotal;
  const stressedRevenue = retainedRevenue == null ? null : Math.round(retainedRevenue * 0.8);
  const stressedProjectMargin = stressedRevenue == null || budgetTotal == null
    ? null : stressedRevenue - budgetTotal;
  const cashBeforeDebtService = retainedRevenue == null || budgetTotal == null
    ? null : retainedRevenue + ownContribution + otherFunding + requestedAmount - budgetTotal;
  const stressedCashBeforeDebtService = stressedRevenue == null || budgetTotal == null
    ? null : stressedRevenue + ownContribution + otherFunding + requestedAmount - budgetTotal;
  const treasuryAfterRepayment = cashBeforeDebtService == null || loanTerms.total_repayable <= 0
    ? null : cashBeforeDebtService - loanTerms.total_repayable;
  const stressedTreasuryAfterRepayment = stressedCashBeforeDebtService == null || loanTerms.total_repayable <= 0
    ? null : stressedCashBeforeDebtService - loanTerms.total_repayable;
  const agriculturalDebtCoverageRatio = cashBeforeDebtService == null || loanTerms.total_repayable <= 0
    ? null : cashBeforeDebtService / loanTerms.total_repayable;
  const stressedAgriculturalDebtCoverageRatio = stressedCashBeforeDebtService == null || loanTerms.total_repayable <= 0
    ? null : stressedCashBeforeDebtService / loanTerms.total_repayable;
  return {
    ...localMetrics,
    project_surface_ha: agriculturalNumber(project.project_surface_ha, { positive: true }),
    surface_ha: agriculturalNumber(project.project_surface_ha, { positive: true }),
    expected_price: agriculturalNumber(project.expected_price),
    price: agriculturalNumber(project.expected_price),
    loss_percent: agriculturalNumber(project.loss_percent),
    declared_yield: declaredYield,
    teranga_yield: terangaYield,
    predicted_yield_kg_ha: terangaYield,
    retained_yield: retainedYield,
    declared_production: declaredProduction.saleable,
    retained_production: retainedProduction.saleable,
    expected_volume: retainedProduction.saleable,
    declared_revenue: declaredRevenue,
    retained_revenue: retainedRevenue,
    revenue_adjustment: declaredRevenue == null || retainedRevenue == null
      ? null : retainedRevenue - declaredRevenue,
    external_adjustment_applied: adjustmentAllowed && retainedYield !== declaredYield,
    project_cost: budgetTotal,
    own_contribution: ownContribution,
    other_funding: otherFunding,
    non_debt_funding: ownContribution + otherFunding,
    financing_need: financingNeed,
    amount_requested: requestedAmount || null,
    principal_borrowed: requestedAmount || null,
    recommended_amount: recommendedAmount,
    financing_difference: financingDifference,
    overfinancing,
    remaining_financing_gap: remainingFinancingGap,
    interest_rate: loanTerms.interest_rate,
    interest_amount: loanTerms.interest_amount,
    total_repayable: loanTerms.total_repayable || null,
    debt_service_total: loanTerms.total_repayable || null,
    project_margin: projectMargin,
    economic_margin: projectMargin,
    stressed_revenue: stressedRevenue,
    stressed_project_margin: stressedProjectMargin,
    stressed_economic_margin: stressedProjectMargin,
    cash_before_debt_service: cashBeforeDebtService,
    stressed_cash_before_debt_service: stressedCashBeforeDebtService,
    treasury_after_repayment: treasuryAfterRepayment,
    stressed_treasury_after_repayment: stressedTreasuryAfterRepayment,
    agricultural_debt_coverage_ratio: agriculturalDebtCoverageRatio == null
      ? null : Number(agriculturalDebtCoverageRatio.toFixed(4)),
    stressed_agricultural_debt_coverage_ratio: stressedAgriculturalDebtCoverageRatio == null
      ? null : Number(stressedAgriculturalDebtCoverageRatio.toFixed(4)),
    agricultural_repayment_possible: treasuryAfterRepayment == null
      ? null : treasuryAfterRepayment >= 0,
    repayment_assessment_scope: 'indicative_agricultural_projection',
    canonical_repayment_assessment_required: true,
    // Compatibilité API : ces alias décrivent désormais la trésorerie agricole indicative.
    margin_after_debt: treasuryAfterRepayment,
    stressed_margin_after_debt: stressedTreasuryAfterRepayment,
    debt_coverage_ratio: agriculturalDebtCoverageRatio == null
      ? null : Number(agriculturalDebtCoverageRatio.toFixed(4)),
    stressed_debt_coverage_ratio: stressedAgriculturalDebtCoverageRatio == null
      ? null : Number(stressedAgriculturalDebtCoverageRatio.toFixed(4)),
    repayment_possible: treasuryAfterRepayment == null ? null : treasuryAfterRepayment >= 0,
  };
}

function quantity(value, unit) {
  return value == null ? 'non calculé' : `${Math.round(value)} ${unit}`;
}

function amount(value) {
  return value == null ? 'non calculé' : `${Math.round(value)} FCFA`;
}

export function buildAgriculturalFeasibilityContract({
  local = {}, project = {}, inputItems = [], evidence = [], retainedYield = null,
  terangaYield = null, externalAdjustmentApplied = false,
} = {}) {
  const metrics = buildFeasibilityMetrics(
    local.metrics || {},
    project,
    terangaYield == null ? [] : [{ type: 'yield', predicted_yield_kg_ha: terangaYield }],
    { mode: externalAdjustmentApplied || terangaYield != null ? 'hybrid' : 'local_offline' },
    { credit: {
      ...project,
      interest_rate: project.interest_rate ?? project.interest_rate_percent,
      interest_amount: project.interest_amount ?? project.credit_interest_amount,
      total_repayable: project.total_repayable ?? project.total_due ?? project.credit_total_due,
      duration_months: project.duration_months
        ?? (project.interest_rate != null || project.interest_rate_percent != null ? 12 : undefined),
      desired_schedule: project.desired_schedule,
    } },
  );
  const realNeed = metrics.financing_need;
  const requested = metrics.amount_requested;
  const overfinancing = realNeed == null || requested == null ? null : Math.max(0, requested - realNeed);
  const missingData = [...new Set([
    ...(local.missing_data || []),
    ...(metrics.project_cost == null ? ['coût détaillé du projet'] : []),
    ...(requested == null ? ['montant demandé'] : []),
    ...(metrics.retained_revenue == null ? ['données de production et de prix'] : []),
  ])];
  const assumptions = [
    `Le rendement retenu est ${metrics.retained_yield == null ? 'indisponible' : `${metrics.retained_yield} kg/ha`}.`,
    `Les pertes sont ${metrics.loss_percent == null ? 'non renseignées' : `fixées à ${metrics.loss_percent} %`}.`,
    'Le scénario stressé applique une baisse de 20 % au revenu.',
  ];
  const risks = local.findings?.map(item => item.explanation).filter(Boolean) || [];
  if (overfinancing > 0) risks.push(`Le montant demandé dépasse le besoin réel de ${Math.round(overfinancing)} FCFA.`);
  const gains = [
    metrics.economic_margin == null ? 'Marge économique non calculable.' : `Marge économique estimée : ${Math.round(metrics.economic_margin)} FCFA.`,
    metrics.treasury_after_repayment == null
      ? 'Trésorerie agricole indicative après remboursement non calculable.'
      : `Trésorerie agricole indicative après remboursement : ${Math.round(metrics.treasury_after_repayment)} FCFA.`,
    'La capacité de remboursement définitive reste évaluée par le cash-flow canonique du dossier.',
  ];
  return {
    metrics: {
      ...metrics,
      real_financing_need: realNeed,
      overfinancing,
      total_due: metrics.total_repayable,
      revenue: metrics.retained_revenue,
      margin: metrics.economic_margin,
      gross_margin: metrics.economic_margin,
      surplus_after_repayment: metrics.treasury_after_repayment,
      repayment_coverage_ratio: metrics.agricultural_debt_coverage_ratio,
      stress_revenue_minus_20_percent: metrics.stressed_revenue,
      stress_surplus_after_repayment: metrics.stressed_treasury_after_repayment,
      stress_coverage_ratio: metrics.stressed_agricultural_debt_coverage_ratio,
    },
    report: {
      language: 'fr',
      narrative: `Le besoin réel est ${realNeed == null ? 'non calculé' : `estimé à ${Math.round(realNeed)} FCFA`}. ${buildFeasibilityReport({
        status: local.adequacy_status === 'INCOMPATIBLE' || local.viability_status === 'NON_VIABLE'
          ? 'HUMAN_REVIEW' : local.findings?.length ? 'ADJUST' : 'FEASIBLE',
        project, local, metrics, source: { fallback_reason: 'not_configured' },
      })}`,
      assumptions,
      evidence: evidence.map((item, index) => item.label || item.document_type || item.type || item.filename || `Preuve ${index + 1}`),
      missing_data: missingData,
      risks: risks.length ? risks : ['Aucun risque supplémentaire détecté avec les données disponibles.'],
      benefits: metrics.project_margin != null && metrics.project_margin > 0
        ? ['Le revenu estimé couvre le coût du projet avant remboursement.']
        : ['Le bénéfice économique reste à confirmer.'],
      gains,
      mini_table: [
        ['Coût du projet', metrics.project_cost],
        ['Besoin réel', realNeed],
        ['Montant demandé', requested],
        ['Montant conseillé', metrics.recommended_amount],
        ['Revenu', metrics.retained_revenue],
        ['Marge économique', metrics.economic_margin],
        ['Total dû', metrics.debt_service_total],
        ['Trésorerie agricole indicative après remboursement', metrics.treasury_after_repayment],
      ].map(([label, value]) => ({ label, value, unit: 'FCFA' })),
    },
  };
}

export function buildFeasibilityReport({ status, project = {}, local = {}, metrics = {}, source = {} }) {
  const reason = feasibilityReasonMessage(source.fallback_reason);
  const teranga = metrics.teranga_yield == null
    ? `non calculé — ${reason}`
    : quantity(metrics.teranga_yield, 'kg/ha');
  const risks = local.findings?.map(item => item.explanation).filter(Boolean).join(' ') || 'aucun risque bloquant identifié';
  const recommendations = local.findings?.map(item => item.action).filter(Boolean).join(' ') || 'conserver les hypothèses et joindre les preuves disponibles';
  const missing = local.missing_data?.map(item => item.label || item).filter(Boolean).join(', ') || 'aucune donnée indispensable';
  const feasibility = status === 'FEASIBLE' ? 'faisable' : status === 'HUMAN_REVIEW' ? 'revue humaine requise' : 'à ajuster';
  return `Faisabilité : ${feasibility}. Rendement déclaré : ${quantity(metrics.declared_yield, 'kg/ha')}. `
    + `Rendement Teranga : ${teranga}. Rendement retenu : ${quantity(metrics.retained_yield, 'kg/ha')}. `
    + `Volume attendu sur ${project.project_surface_ha || 'surface non renseignée'} ha : ${quantity(metrics.expected_volume, 'kg')}. `
    + `Revenu déclaré : ${amount(metrics.declared_revenue)}. Revenu retenu : ${amount(metrics.retained_revenue)}. `
    + `Risques : ${risks}. Recommandations : ${recommendations}. Données à compléter ou justifier : ${missing}. `
    + 'Aucun classement fiable de cultures n’est disponible sans référence comparative versionnée.';
}
