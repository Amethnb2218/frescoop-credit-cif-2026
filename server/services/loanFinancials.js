import { calculateLoanTerms } from '../../shared/creditCalculations.js';

function optionalNonNegative(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function rounded(value) {
  return Math.round(value);
}

export function resolveLoanFinancials(input = {}, existing = {}) {
  const merged = { ...existing, ...input };
  if (merged.interest_calculation_mode == null
    && Object.prototype.hasOwnProperty.call(input, 'interest_amount')) {
    merged.interest_calculation_mode = 'fixed';
  }
  const terms = calculateLoanTerms(merged);
  return {
    principal: terms.principal,
    interest_rate: terms.interest_rate,
    interest_calculation_mode: terms.interest_calculation_mode,
    interest_amount: terms.interest_amount,
    total_repayable: terms.total_repayable,
    duration_months: terms.duration_months,
    schedule_type: terms.schedule_type,
    monthly_payment: terms.duration_months > 0
      ? Math.ceil(terms.total_repayable / terms.duration_months)
      : 0,
  };
}

function parseMetrics(projectAssessment) {
  if (!projectAssessment) return null;
  const raw = projectAssessment.calculated_metrics ?? projectAssessment.metrics;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function resolveFinancingNeed(dossier = {}, projectAssessment = null) {
  const metrics = parseMetrics(projectAssessment);
  if (!metrics) return null;
  const need = optionalNonNegative(
    metrics.financing_need ?? metrics.financing_gap ?? metrics.actual_need ?? metrics.real_need,
  );
  if (need == null) return null;
  const requested = optionalNonNegative(dossier.amount_requested) || 0;
  return {
    actual_need: rounded(need),
    requested_amount: rounded(requested),
    overfinancing: rounded(Math.max(0, requested - need)),
    recommended_amount: rounded(Math.min(requested, need)),
  };
}

export function summarizeDossierFinancials(dossiers = [], assessments = []) {
  const assessmentByDossier = new Map(assessments.map(item => [item.dossier_id, item]));
  return dossiers.reduce((summary, dossier) => {
    const loan = resolveLoanFinancials(dossier);
    const financing = resolveFinancingNeed(dossier, assessmentByDossier.get(dossier.id));
    summary.total_requested += loan.principal;
    summary.total_interest += loan.interest_amount;
    summary.total_repayable += loan.total_repayable;
    if (financing) {
      summary.dossiers_with_financing_need += 1;
      summary.total_actual_need += financing.actual_need;
      summary.total_overfinancing += financing.overfinancing;
      summary.total_recommended_amount += financing.recommended_amount;
    }
    return summary;
  }, {
    total_requested: 0,
    total_interest: 0,
    total_repayable: 0,
    total_actual_need: 0,
    total_overfinancing: 0,
    total_recommended_amount: 0,
    dossiers_with_financing_need: 0,
  });
}
