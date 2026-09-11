import { randomUUID } from 'crypto';
import { hasBicConsent } from './dossierAccess.js';
import {
  buildDetailedRepaymentSchedule,
  calculateLoanTerms,
  normalizeScheduleType,
} from '../../shared/creditCalculations.js';

export const SCORE_VERSION = 5;

const EVIDENCE_WEIGHTS = { A: 1, B: 0.75, C: 0.4, D: 0.1 };
const RISK_PENALTIES = { low: 3, medium: 5, high: 8, critical: 20 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseJsonObject(value) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildAgronomicContext(project = null, cashflow = []) {
  const analysis = parseJsonObject(project?.feasibility_analysis);
  const metrics = analysis.metrics || analysis.details?.metrics || {};
  const declaredRevenue = numberOrNull(project?.declared_revenue ?? metrics.declared_revenue);
  const retainedRevenue = numberOrNull(project?.retained_revenue ?? metrics.retained_revenue);
  const declaredYield = numberOrNull(project?.expected_yield ?? metrics.declared_yield);
  const terangaYield = numberOrNull(project?.teranga_yield ?? metrics.teranga_yield);
  const retainedYield = numberOrNull(project?.retained_yield ?? metrics.retained_yield);
  const status = project?.feasibility_status || analysis.status || null;
  const sourceMode = project?.feasibility_mode || analysis.source?.mode || null;
  const fallbackUsed = Boolean(analysis.source?.fallback_used)
    || ['local', 'local_offline', 'local_fallback'].includes(sourceMode);
  const agricultureByEntry = cashflow.map(entry => {
    const detail = parseJsonObject(entry.revenue_detail);
    return Number(detail.agriculture || 0);
  });
  const retainedAgriculture = agricultureByEntry.reduce((sum, amount) => sum + amount, 0);
  const revenueDelta = declaredRevenue != null && retainedRevenue != null
    ? Math.max(declaredRevenue - retainedRevenue, 0)
    : 0;
  let declaredCashflow = cashflow;
  if (revenueDelta > 0 && cashflow.length > 0) {
    if (retainedAgriculture > 0) {
      declaredCashflow = cashflow.map((entry, index) => ({
        ...entry,
        revenue: Number(entry.revenue || 0)
          + revenueDelta * (agricultureByEntry[index] / retainedAgriculture),
      }));
    } else {
      const harvestIndex = cashflow.reduce(
        (best, entry, index, entries) => Number(entry.revenue || 0) > Number(entries[best].revenue || 0) ? index : best,
        0,
      );
      declaredCashflow = cashflow.map((entry, index) => index === harvestIndex
        ? { ...entry, revenue: Number(entry.revenue || 0) + revenueDelta }
        : entry);
    }
  }

  return {
    status,
    sourceMode,
    fallbackUsed,
    declaredYield,
    terangaYield,
    retainedYield,
    declaredRevenue,
    retainedRevenue,
    revenueDelta,
    declaredCashflow,
    terangaAdjusted: terangaYield != null && retainedRevenue != null && declaredRevenue != null
      && retainedRevenue < declaredRevenue && !fallbackUsed,
  };
}

export function buildEvaluationContext(dossier, cashflow = [], evidence = [], bicRecords = [], agriculturalProject = null) {
  const agronomic = buildAgronomicContext(agriculturalProject, cashflow);
  const totalRevenue = cashflow.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0);
  const totalExpenses = cashflow.reduce((sum, entry) => sum + Number(entry.expenses || 0), 0);
  const totalDebt = cashflow.reduce((sum, entry) => sum + Number(entry.debt_payments || 0), 0);
  const netFlow = totalRevenue - totalExpenses - totalDebt;
  const cashflowMonths = cashflow.length;
  const averageMonthlyNet = cashflowMonths > 0 ? netFlow / cashflowMonths : 0;
  const stressedNetFlow = totalRevenue * 0.8 - totalExpenses - totalDebt;
  const stressedAverageMonthlyNet = cashflowMonths > 0 ? stressedNetFlow / cashflowMonths : 0;
  const loanTerms = calculateLoanTerms(dossier);
  const amountRequested = loanTerms.principal;
  const durationMonths = loanTerms.duration_months;
  const totalRepayable = loanTerms.total_repayable;
  const monthlyPayment = totalRepayable > 0 && durationMonths > 0
    ? Math.ceil(totalRepayable / durationMonths)
    : 0;
  const scheduleType = normalizeScheduleType(dossier.desired_schedule);
  const detailedRepaymentSchedule = buildDetailedRepaymentSchedule({
    ...dossier,
    schedule_type: scheduleType,
  }, cashflow);
  const repaymentSchedule = detailedRepaymentSchedule.installments.map(item => item.payment);
  const stressedCashflow = cashflow.map(entry => ({
    ...entry,
    revenue: Number(entry.revenue || 0) * 0.8,
  }));
  const seasonalCoverage = calculateScheduleCoverage(cashflow, repaymentSchedule);
  const stressedSeasonalCoverage = calculateScheduleCoverage(stressedCashflow, repaymentSchedule);
  const declaredStressedCashflow = agronomic.declaredCashflow.map(entry => ({
    ...entry,
    revenue: Number(entry.revenue || 0) * 0.8,
  }));
  const declaredTotalRevenue = agronomic.declaredCashflow.reduce(
    (sum, entry) => sum + Number(entry.revenue || 0),
    0,
  );
  const declaredNetFlow = declaredTotalRevenue - totalExpenses - totalDebt;
  const declaredAverageMonthlyNet = cashflowMonths > 0 ? declaredNetFlow / cashflowMonths : 0;
  const declaredStressedNetFlow = declaredTotalRevenue * 0.8 - totalExpenses - totalDebt;
  const declaredStressedAverageMonthlyNet = cashflowMonths > 0
    ? declaredStressedNetFlow / cashflowMonths
    : 0;
  const declaredSeasonalCoverage = calculateScheduleCoverage(agronomic.declaredCashflow, repaymentSchedule);
  const declaredStressedSeasonalCoverage = calculateScheduleCoverage(declaredStressedCashflow, repaymentSchedule);
  const evidenceCounts = { A: 0, B: 0, C: 0, D: 0 };
  evidence.forEach(item => {
    if (item.verification_level in evidenceCounts) evidenceCounts[item.verification_level] += 1;
  });

  return {
    totalRevenue,
    totalExpenses,
    totalDebt,
    netFlow,
    cashflowMonths,
    averageMonthlyNet,
    stressedNetFlow,
    stressedAverageMonthlyNet,
    monthlyPayment,
    interestRate: loanTerms.interest_rate,
    interestAmount: loanTerms.interest_amount,
    totalRepayable,
    loanTerms,
    scheduleType,
    detailedRepaymentSchedule: detailedRepaymentSchedule.installments,
    repaymentSchedule,
    seasonalCoverage,
    stressedSeasonalCoverage,
    declaredTotalRevenue,
    declaredAverageMonthlyNet,
    declaredStressedAverageMonthlyNet,
    declaredSeasonalCoverage,
    declaredStressedSeasonalCoverage,
    agronomic,
    monthsWithRevenue: cashflow.filter(entry => Number(entry.revenue) > 0).length,
    amountRequested,
    durationMonths,
    evidenceACount: evidenceCounts.A,
    evidenceBCount: evidenceCounts.B,
    evidenceCCount: evidenceCounts.C,
    evidenceDCount: evidenceCounts.D,
    totalEvidence: evidence.length,
    existingDebt: bicRecords.reduce((sum, record) => sum + Number(record.outstanding || 0), 0),
    hasLatePayments: bicRecords.some(record => Number(record.days_late) > 30),
    hasIdentity: Boolean(dossier.applicant_name),
    hasCashflow: cashflow.length > 0,
    surface: Number(dossier.surface_ha || 0),
    yearsExperience: Number(dossier.years_experience || 0),
    evidenceCounts,
  };
}

export function listMissingPrequalificationData(
  dossier,
  context,
  agriculturalProject = null,
  agriculturalInputs = [],
) {
  const missing = [];
  const add = (code, field, label) => missing.push({ code, field, label });

  if (!dossier.applicant_name) {
    add('APPLICANT_NAME_REQUIRED', 'applicant_name', 'Nom du demandeur');
  }
  if (!dossier.applicant_id_number) {
    add('APPLICANT_ID_REQUIRED', 'applicant_id_number', 'Numéro d’identité');
  }
  if (dossier.sector !== 'Agriculture') {
    add('AGRICULTURE_SECTOR_REQUIRED', 'sector', 'Secteur Agriculture');
  }
  if (!dossier.activity_type) {
    add('ACTIVITY_TYPE_REQUIRED', 'activity_type', 'Type d’activité');
  }
  if (context.amountRequested <= 0) {
    add('POSITIVE_AMOUNT_REQUIRED', 'amount_requested', 'Montant demandé positif');
  }
  if (context.durationMonths <= 0) {
    add('POSITIVE_DURATION_REQUIRED', 'duration_months', 'Durée du crédit positive');
  }
  if (!context.hasCashflow) {
    add('CASHFLOW_REQUIRED', 'cashflow_entries', 'Flux de trésorerie');
  } else if (context.monthsWithRevenue <= 0) {
    add('POSITIVE_REVENUE_MONTH_REQUIRED', 'cashflow_entries.revenue', 'Au moins un mois avec un revenu positif');
  }

  if (!agriculturalProject) {
    add('AGRICULTURAL_PROJECT_REQUIRED', 'agricultural_project', 'Évaluation du projet agricole');
  } else {
    if (!agriculturalProject.crop_code && !agriculturalProject.crop_label) {
      add('CROP_REQUIRED', 'agricultural_project.crop', 'Culture');
    }
    if (Number(agriculturalProject.project_surface_ha || 0) <= 0) {
      add('POSITIVE_PROJECT_SURFACE_REQUIRED', 'agricultural_project.project_surface_ha', 'Surface agricole positive');
    }
    if (Number(agriculturalProject.expected_yield || 0) <= 0) {
      add('POSITIVE_EXPECTED_YIELD_REQUIRED', 'agricultural_project.expected_yield', 'Rendement attendu positif');
    }
    if (Number(agriculturalProject.expected_price || 0) <= 0) {
      add('POSITIVE_EXPECTED_PRICE_REQUIRED', 'agricultural_project.expected_price', 'Prix de vente attendu positif');
    }
  }

  if (agriculturalInputs.length === 0) {
    add('AGRICULTURAL_INPUT_REQUIRED', 'agricultural_input_items', 'Au moins un intrant agricole');
  } else if (!agriculturalInputs.some(item => Number(item.total_cost || 0) > 0)) {
    add('POSITIVE_INPUT_COST_REQUIRED', 'agricultural_input_items.total_cost', 'Au moins un intrant à coût positif');
  }

  return missing;
}

export function buildRepaymentSchedule(scheduleType, amountRequested, durationMonths, cashflow = [], credit = {}) {
  return buildDetailedRepaymentSchedule({
    ...credit,
    amount_requested: amountRequested,
    duration_months: durationMonths,
    schedule_type: scheduleType,
  }, cashflow).installments.map(item => item.payment);
}

export function calculateScheduleCoverage(cashflow = [], repaymentSchedule = []) {
  const paymentMonths = repaymentSchedule
    .map((payment, index) => ({ payment: Number(payment || 0), index }))
    .filter(item => item.payment > 0);
  if (!paymentMonths.length) return null;
  let cumulativeCash = 0;
  let minimumCoverage = Infinity;
  let minimumMargin = Infinity;
  for (let index = 0; index < repaymentSchedule.length; index += 1) {
    const entry = cashflow[index] || {};
    cumulativeCash += Number(entry.revenue || 0) - Number(entry.expenses || 0) - Number(entry.debt_payments || 0);
    const payment = Number(repaymentSchedule[index] || 0);
    if (payment <= 0) continue;
    const available = Math.max(cumulativeCash, 0);
    minimumCoverage = Math.min(minimumCoverage, available / payment);
    cumulativeCash -= payment;
    minimumMargin = Math.min(minimumMargin, cumulativeCash);
  }
  return {
    ratio: Number.isFinite(minimumCoverage) ? minimumCoverage : null,
    minimum_margin: Number.isFinite(minimumMargin) ? Math.round(minimumMargin) : null,
    payment_months: paymentMonths.map(item => item.index + 1),
    payments: repaymentSchedule,
  };
}

export function calculateCapacityRatio(context) {
  if (context.scheduleType !== 'MONTHLY' && context.seasonalCoverage?.ratio != null) {
    return context.seasonalCoverage.ratio;
  }
  if (!context.hasCashflow || context.monthlyPayment <= 0 || context.cashflowMonths <= 0) return null;
  return context.averageMonthlyNet / context.monthlyPayment;
}

export function calculateStressedCapacityRatio(context) {
  if (context.scheduleType !== 'MONTHLY' && context.stressedSeasonalCoverage?.ratio != null) {
    return context.stressedSeasonalCoverage.ratio;
  }
  if (!context.hasCashflow || context.monthlyPayment <= 0 || context.cashflowMonths <= 0) return null;
  return context.stressedAverageMonthlyNet / context.monthlyPayment;
}

export function calculateDeclaredCapacityRatio(context) {
  if (context.scheduleType !== 'MONTHLY' && context.declaredSeasonalCoverage?.ratio != null) {
    return context.declaredSeasonalCoverage.ratio;
  }
  if (!context.hasCashflow || context.monthlyPayment <= 0 || context.cashflowMonths <= 0) return null;
  return context.declaredAverageMonthlyNet / context.monthlyPayment;
}

export function calculateDeclaredStressedCapacityRatio(context) {
  if (context.scheduleType !== 'MONTHLY' && context.declaredStressedSeasonalCoverage?.ratio != null) {
    return context.declaredStressedSeasonalCoverage.ratio;
  }
  if (!context.hasCashflow || context.monthlyPayment <= 0 || context.cashflowMonths <= 0) return null;
  return context.declaredStressedAverageMonthlyNet / context.monthlyPayment;
}

export function classifyRepaymentCapacity(ratio) {
  if (ratio == null || !Number.isFinite(ratio)) return 'UNKNOWN';
  if (ratio >= 1.3) return 'SUFFICIENT';
  if (ratio >= 1) return 'LIMIT';
  return 'INSUFFICIENT';
}

export function calculateEvidenceConfidence(context) {
  const verifiedRatio = context.totalEvidence > 0
    ? (context.evidenceACount + context.evidenceBCount) / context.totalEvidence
    : 0;
  if (verifiedRatio >= 0.7 && context.totalEvidence >= 3) return 'HIGH';
  if (verifiedRatio >= 0.4 || context.totalEvidence >= 2) return 'MEDIUM';
  return 'LOW';
}

export function evaluateRule(rule, context, capacityRatio = calculateCapacityRatio(context)) {
  const expr = rule.condition_expr;
  if (expr === 'NO_IDENTITY') {
    return { triggered: !context.hasIdentity, explanation: 'Identité du demandeur non renseignée' };
  }
  if (expr === 'NO_CASHFLOW') {
    return { triggered: !context.hasCashflow, explanation: 'Aucun flux de trésorerie renseigné' };
  }
  if (expr === 'CAPACITY_INSUFFICIENT') {
    const declaredRatio = calculateDeclaredCapacityRatio(context);
    const terangaOnlyShortfall = context.agronomic.terangaAdjusted
      && declaredRatio != null
      && declaredRatio >= 1
      && capacityRatio != null
      && capacityRatio < 1;
    return {
      triggered: capacityRatio != null && capacityRatio < 1 && !terangaOnlyShortfall,
      neutralized: terangaOnlyShortfall,
      explanation: capacityRatio == null
        ? 'Capacité non calculable — données insuffisantes'
        : terangaOnlyShortfall
          ? `Refus automatique neutralisé : capacité déclarée ${declaredRatio.toFixed(2)}, capacité retenue ${capacityRatio.toFixed(2)} — revue agronomique humaine requise`
          : `Flux net insuffisant pour couvrir l'échéance (ratio: ${capacityRatio.toFixed(2)})`,
    };
  }
  if (expr === 'CAPACITY_STRESSED') {
    const ratio = calculateStressedCapacityRatio(context);
    return {
      triggered: ratio != null && ratio < 1,
      explanation: ratio == null
        ? 'Capacité stressée non calculable — données insuffisantes'
        : `Capacité insuffisante sous scénario prudent -20% (ratio: ${ratio.toFixed(2)})`,
    };
  }
  if (expr === 'AGRONOMIC_ADJUSTMENT') {
    const triggered = context.agronomic.status === 'ADJUST' && !context.agronomic.fallbackUsed;
    return {
      triggered,
      explanation: triggered
        ? 'Rendement ajusté par le signal Teranga — revue agronomique humaine requise'
        : 'Aucun ajustement agronomique Teranga nécessitant une revue',
    };
  }
  if (expr === 'AGRONOMIC_HUMAN_REVIEW') {
    const triggered = context.agronomic.status === 'HUMAN_REVIEW' && !context.agronomic.fallbackUsed;
    return {
      triggered,
      explanation: triggered
        ? 'Signaux agronomiques divergents ou sensibles — décision humaine obligatoire'
        : 'Aucun signal Teranga imposant une revue humaine',
    };
  }
  if (expr === 'HIGH_EXISTING_DEBT') {
    const ratio = context.amountRequested > 0 ? context.existingDebt / context.amountRequested : 0;
    return { triggered: ratio > 0.5, explanation: `Dette existante élevée (${context.existingDebt.toLocaleString()} FCFA, ratio: ${ratio.toFixed(2)})` };
  }
  if (expr === 'LATE_PAYMENTS') {
    return { triggered: context.hasLatePayments, explanation: 'Retards de paiement détectés au BIC (>30 jours)' };
  }
  if (expr === 'LOW_EVIDENCE') {
    return { triggered: context.totalEvidence < 2, explanation: `Trop peu de preuves (${context.totalEvidence} pièce(s))` };
  }
  if (expr === 'MOSTLY_DECLARATIVE') {
    const ratio = context.totalEvidence > 0 ? context.evidenceDCount / context.totalEvidence : 0;
    return { triggered: ratio > 0.7 && context.totalEvidence >= 2, explanation: `Majorité des preuves déclaratives (${Math.round(ratio * 100)}%)` };
  }
  if (expr === 'SEASONAL_MISMATCH') {
    const concentrated = context.monthsWithRevenue > 0 && context.monthsWithRevenue <= 4;
    return { triggered: concentrated && context.durationMonths > 6, explanation: `Revenus concentrés sur ${context.monthsWithRevenue} mois — calendrier saisonnier recommandé` };
  }
  if (expr === 'AMOUNT_HIGH_VS_REVENUE') {
    const ratio = context.totalRevenue > 0 ? context.amountRequested / context.totalRevenue : null;
    return {
      triggered: ratio == null || ratio > 0.8,
      explanation: ratio == null
        ? 'Montant demandé non couvert par des revenus documentés'
        : `Montant demandé élevé par rapport aux revenus annuels (ratio: ${ratio.toFixed(2)})`,
    };
  }
  return { triggered: false, explanation: 'Règle non évaluée' };
}

export function determinePrequalification(evaluations, evidenceConfidence, repaymentCapacity) {
  const critical = evaluations.filter(item => item.triggered && item.result === 'NON_ELIGIBLE');
  const review = evaluations.filter(item => item.triggered && item.result === 'REVUE_REQUISE');
  if (critical.length > 0) {
    return { prequalification: 'NON_ELIGIBLE', reasons: critical.map(item => item.explanation) };
  }
  if (review.length > 0 || evidenceConfidence === 'LOW' || repaymentCapacity !== 'SUFFICIENT') {
    const reasons = evaluations.filter(item => item.triggered).map(item => item.explanation);
    if (evidenceConfidence === 'LOW') reasons.push('Niveau de confiance des preuves insuffisant');
    if (repaymentCapacity === 'LIMIT') reasons.push('Capacité de remboursement limite');
    if (repaymentCapacity === 'INSUFFICIENT') reasons.push('Capacité de remboursement insuffisante');
    if (repaymentCapacity === 'UNKNOWN') reasons.push('Capacité de remboursement non calculable');
    return { prequalification: 'REVUE_REQUISE', reasons: [...new Set(reasons)] };
  }
  return {
    prequalification: 'PREQUALIFIE',
    reasons: ['Toutes les règles respectées', 'Capacité de remboursement suffisante', 'Preuves vérifiées'],
  };
}

export function computePrequalificationScore(context, evaluations, prequalification, capacityRatio) {
  const identity = context.hasIdentity ? 15 : 0;
  const capacity = capacityRatio == null
    ? 0
    : Math.round(35 * clamp(capacityRatio / 1.3, 0, 1));
  const coverage = Math.round(10 * clamp(context.totalEvidence / 3, 0, 1));
  const qualityTotal = Object.entries(context.evidenceCounts).reduce(
    (sum, [level, count]) => sum + count * EVIDENCE_WEIGHTS[level],
    0,
  );
  const quality = context.totalEvidence > 0
    ? Math.round(20 * qualityTotal / context.totalEvidence)
    : 0;
  const penalties = evaluations
    .filter(item => item.triggered)
    .map(item => ({
      code: item.rule_code,
      severity: item.severity || 'medium',
      points: RISK_PENALTIES[item.severity] || RISK_PENALTIES.medium,
    }));
  const risk = clamp(20 - penalties.reduce((sum, penalty) => sum + penalty.points, 0), 0, 20);
  const rawScore = clamp(identity + capacity + coverage + quality + risk, 0, 100);

  const score = Math.round(rawScore);

  return {
    score,
    details: {
      version: SCORE_VERSION,
      raw_score: rawScore,
      decision_outcome: prequalification,
      capacity_ratio: capacityRatio == null ? null : Number(capacityRatio.toFixed(4)),
      components: {
        identity: { points: identity, maximum: 15 },
        capacity: { points: capacity, maximum: 35 },
        evidence: { points: coverage + quality, maximum: 30, coverage, quality },
        risk: { points: risk, maximum: 20 },
      },
      evidence_counts: context.evidenceCounts,
      penalties,
    },
  };
}

export function evaluatePrequalification(dossier, cashflow, evidence, bicRecords, rules, agriculturalProject = null, agriculturalInputs = []) {
  const context = buildEvaluationContext(dossier, cashflow, evidence, bicRecords, agriculturalProject);
  const capacityRatio = calculateCapacityRatio(context);
  const stressedCapacityRatio = calculateStressedCapacityRatio(context);
  const declaredCapacityRatio = calculateDeclaredCapacityRatio(context);
  const declaredStressedCapacityRatio = calculateDeclaredStressedCapacityRatio(context);
  const repaymentCapacity = classifyRepaymentCapacity(capacityRatio);
  const evidenceConfidence = calculateEvidenceConfidence(context);
  const evaluations = [...rules]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(rule => {
      const result = evaluateRule(rule, context, capacityRatio);
      return {
        rule_id: rule.id,
        rule_code: rule.code,
        rule_name: rule.name,
        severity: rule.severity,
        result: result.triggered ? rule.result : null,
        ...result,
      };
    });
  const decision = determinePrequalification(evaluations, evidenceConfidence, repaymentCapacity);
  const missingData = listMissingPrequalificationData(
    dossier,
    context,
    agriculturalProject,
    agriculturalInputs,
  );
  const isComplete = missingData.length === 0;
  const computedScoring = computePrequalificationScore(
    context,
    evaluations,
    decision.prequalification,
    capacityRatio,
  );
  const scoring = isComplete
    ? computedScoring
    : {
        ...computedScoring,
        details: {
          ...computedScoring.details,
          status: 'INSUFFICIENT_DATA',
          provisional: true,
          missing_data: missingData,
          missing_fields: missingData,
          message: 'Score provisoire calculé sur les données disponibles — complétez les éléments indiqués pour obtenir le score définitif.',
        },
      };
  const agronomicRuleCodes = evaluations
    .filter(item => item.triggered && ['AGRONOMIC_ADJUSTMENT', 'AGRONOMIC_HUMAN_REVIEW'].includes(
      rules.find(rule => rule.id === item.rule_id)?.condition_expr,
    ))
    .map(item => item.rule_code);
  const capacityRule = evaluations.find(item => item.rule_code === 'RULE-CAP-001');
  const agronomicImpact = {
    status: context.agronomic.status,
    source_mode: context.agronomic.sourceMode,
    fallback_used: context.agronomic.fallbackUsed,
    declared_yield: context.agronomic.declaredYield,
    teranga_yield: context.agronomic.terangaYield,
    retained_yield: context.agronomic.retainedYield,
    declared_revenue: context.agronomic.declaredRevenue,
    retained_revenue: context.agronomic.retainedRevenue,
    revenue_adjustment: context.agronomic.revenueDelta,
    declared_capacity_ratio: declaredCapacityRatio != null
      ? Number(declaredCapacityRatio.toFixed(4))
      : null,
    retained_capacity_ratio: capacityRatio != null
      ? Number(capacityRatio.toFixed(4))
      : null,
    declared_stressed_capacity_ratio: declaredStressedCapacityRatio != null
      ? Number(declaredStressedCapacityRatio.toFixed(4))
      : null,
    retained_stressed_capacity_ratio: stressedCapacityRatio != null
      ? Number(stressedCapacityRatio.toFixed(4))
      : null,
    teranga_adjusted: context.agronomic.terangaAdjusted,
    capacity_rule_neutralized: Boolean(capacityRule?.neutralized),
    review_rules: agronomicRuleCodes,
    explanation: context.agronomic.fallbackUsed
      ? 'Repli local FresCoop : aucune pénalité liée à l’indisponibilité de Teranga.'
      : capacityRule?.neutralized
        ? 'La baisse issue de Teranga impose une revue humaine sans refus automatique.'
        : context.agronomic.terangaAdjusted
          ? 'Le score utilise le Revenu retenu ; les valeurs déclarées restent visibles pour la décision humaine.'
          : 'Aucun ajustement Teranga ne modifie la capacité de remboursement.',
  };
  const details = {
    ...scoring.details,
    declared_capacity_ratio: declaredCapacityRatio != null
      ? Number(declaredCapacityRatio.toFixed(4))
      : null,
    retained_capacity_ratio: capacityRatio != null ? Number(capacityRatio.toFixed(4)) : null,
    stressed_capacity_ratio: stressedCapacityRatio != null
      ? Number(stressedCapacityRatio.toFixed(4))
      : null,
    declared_stressed_capacity_ratio: declaredStressedCapacityRatio != null
      ? Number(declaredStressedCapacityRatio.toFixed(4))
      : null,
    retained_stressed_capacity_ratio: stressedCapacityRatio != null
      ? Number(stressedCapacityRatio.toFixed(4))
      : null,
    agronomic_impact: agronomicImpact,
    average_monthly_net: context.hasCashflow ? Math.round(context.averageMonthlyNet) : null,
    stressed_average_monthly_net: context.hasCashflow ? Math.round(context.stressedAverageMonthlyNet) : null,
    proposed_monthly_payment: context.monthlyPayment || null,
    interest_rate: context.interestRate,
    interest_amount: context.interestAmount,
    total_repayable: context.totalRepayable,
    monthly_margin_after_payment: context.hasCashflow && context.monthlyPayment > 0
      ? Math.round(context.averageMonthlyNet - context.monthlyPayment)
      : null,
    revenue_months: context.monthsWithRevenue,
    schedule_type: context.scheduleType,
    repayment_schedule: context.repaymentSchedule,
    repayment_schedule_details: context.detailedRepaymentSchedule,
    payment_months: context.seasonalCoverage?.payment_months || [],
    schedule_minimum_margin: context.seasonalCoverage?.minimum_margin ?? null,
    stressed_schedule_minimum_margin: context.stressedSeasonalCoverage?.minimum_margin ?? null,
    seasonal_schedule: context.scheduleType === 'SEASONAL',
  };
  return {
    ...decision,
    ...scoring,
    details,
    evidenceConfidence,
    repaymentCapacity,
    evaluations,
    context,
  };
}

export async function evaluateDossier(db, tenantId, dossierId, options = {}) {
  const [dossierResult, cashflowResult, evidenceResult, rulesResult, projectResult, inputsResult] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?', args: [dossierId, tenantId] }),
    db.execute({ sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ? ORDER BY year, month', args: [dossierId, tenantId] }),
    db.execute({ sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] }),
    db.execute({ sql: 'SELECT * FROM rules WHERE tenant_id = ? AND active = 1 ORDER BY code', args: [tenantId] }),
    db.execute({ sql: 'SELECT * FROM agricultural_project_assessments WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] }),
    db.execute({ sql: 'SELECT * FROM agricultural_input_items WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] }),
  ]);
  const dossier = dossierResult.rows[0];
  if (!dossier) return null;
  const bicAllowed = await hasBicConsent(db, dossierId, tenantId);
  const bicResult = bicAllowed
    ? await db.execute({
        sql: 'SELECT * FROM bic_records WHERE tenant_id = ? AND applicant_id_number = ?',
        args: [tenantId, dossier.applicant_id_number || ''],
      })
    : { rows: [] };
  const result = evaluatePrequalification(
    dossier,
    cashflowResult.rows,
    evidenceResult.rows,
    bicResult.rows,
    rulesResult.rows,
    projectResult.rows[0] || null,
    inputsResult.rows,
  );

  const targetDb = options.writeDb || db;
  const idFactory = options.idFactory || randomUUID;
  const updatedAt = options.updatedAt || null;
  const statements = [
    { sql: 'DELETE FROM rule_evaluations WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] },
    ...result.evaluations.map(evaluation => ({
      sql: `INSERT INTO rule_evaluations (id, dossier_id, rule_id, tenant_id, triggered, result, explanation, data_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        idFactory(evaluation), dossierId, evaluation.rule_id, tenantId, evaluation.triggered ? 1 : 0,
        evaluation.result, evaluation.explanation, JSON.stringify(result.context),
      ],
    })),
    {
      sql: `UPDATE dossiers SET evidence_confidence = ?, repayment_capacity = ?, prequalification = ?,
            prequalification_reasons = ?, prequalification_score = ?, prequalification_score_details = ?,
            prequalification_score_version = ?, updated_at = COALESCE(?, datetime('now'))
            WHERE id = ? AND tenant_id = ?`,
      args: [
        result.evidenceConfidence, result.repaymentCapacity, result.prequalification,
        JSON.stringify(result.reasons), result.score, JSON.stringify(result.details),
        SCORE_VERSION, updatedAt, dossierId, tenantId,
      ],
    },
  ];
  await targetDb.batch(statements, 'write');
  return result;
}

export async function recalculateOutdatedScores(db) {
  const dossiers = await db.execute({
    sql: `SELECT id, tenant_id FROM dossiers
          WHERE prequalification_score IS NULL
             OR COALESCE(prequalification_score_version, 1) < ?`,
    args: [SCORE_VERSION],
  });
  let updated = 0;
  const errors = [];
  for (const dossier of dossiers.rows) {
    try {
      await evaluateDossier(db, dossier.tenant_id, dossier.id);
      updated += 1;
    } catch (error) {
      errors.push({ id: dossier.id, message: error.message });
    }
  }
  return { found: dossiers.rows.length, updated, errors };
}
