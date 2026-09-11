import { calculateLoanTerms } from './creditCalculations.js';

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
  const financingNeed = agriculturalNumber(localMetrics.financing_gap);
  const credit = {
    ...financial.credit,
    amount_requested: financial.credit?.amount_requested ?? project.amount_requested,
  };
  const loanTerms = calculateLoanTerms(credit);
  const requestedAmount = loanTerms.principal;
  const recommendedAmount = financingNeed == null ? null : Math.min(requestedAmount, financingNeed);
  const financingDifference = financingNeed == null ? null : requestedAmount - financingNeed;
  const projectMargin = retainedRevenue == null || budgetTotal == null ? null : retainedRevenue - budgetTotal;
  const marginAfterDebt = projectMargin == null || loanTerms.total_repayable <= 0
    ? null : projectMargin - loanTerms.total_repayable;
  const stressedRevenue = retainedRevenue == null ? null : Math.round(retainedRevenue * 0.8);
  const stressedMarginAfterDebt = stressedRevenue == null || budgetTotal == null || loanTerms.total_repayable <= 0
    ? null : stressedRevenue - budgetTotal - loanTerms.total_repayable;
  const debtCoverageRatio = projectMargin == null || loanTerms.total_repayable <= 0
    ? null : projectMargin / loanTerms.total_repayable;
  const stressedDebtCoverageRatio = stressedRevenue == null || budgetTotal == null || loanTerms.total_repayable <= 0
    ? null : (stressedRevenue - budgetTotal) / loanTerms.total_repayable;
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
    financing_need: financingNeed,
    amount_requested: requestedAmount || null,
    recommended_amount: recommendedAmount,
    financing_difference: financingDifference,
    interest_rate: loanTerms.interest_rate,
    interest_amount: loanTerms.interest_amount,
    total_repayable: loanTerms.total_repayable || null,
    project_margin: projectMargin,
    margin_after_debt: marginAfterDebt,
    stressed_revenue: stressedRevenue,
    stressed_margin_after_debt: stressedMarginAfterDebt,
    debt_coverage_ratio: debtCoverageRatio == null ? null : Number(debtCoverageRatio.toFixed(4)),
    stressed_debt_coverage_ratio: stressedDebtCoverageRatio == null ? null : Number(stressedDebtCoverageRatio.toFixed(4)),
    repayment_possible: marginAfterDebt == null ? null : marginAfterDebt >= 0,
  };
}

function quantity(value, unit) {
  return value == null ? 'non calculé' : `${Math.round(value)} ${unit}`;
}

function amount(value) {
  return value == null ? 'non calculé' : `${Math.round(value)} FCFA`;
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
