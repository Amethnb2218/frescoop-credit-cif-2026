import { randomUUID } from 'crypto';

export const SCORE_VERSION = 2;

const EVIDENCE_WEIGHTS = { A: 1, B: 0.75, C: 0.4, D: 0.1 };
const RISK_PENALTIES = { low: 3, medium: 5, high: 8, critical: 20 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function buildEvaluationContext(dossier, cashflow = [], evidence = [], bicRecords = []) {
  const totalRevenue = cashflow.reduce((sum, entry) => sum + Number(entry.revenue || 0), 0);
  const totalExpenses = cashflow.reduce((sum, entry) => sum + Number(entry.expenses || 0), 0);
  const totalDebt = cashflow.reduce((sum, entry) => sum + Number(entry.debt_payments || 0), 0);
  const netFlow = totalRevenue - totalExpenses - totalDebt;
  const amountRequested = Number(dossier.amount_requested || 0);
  const durationMonths = Number(dossier.duration_months || 0);
  const monthlyPayment = amountRequested > 0 && durationMonths > 0
    ? Math.ceil(amountRequested / durationMonths)
    : 0;
  const evidenceCounts = { A: 0, B: 0, C: 0, D: 0 };
  evidence.forEach(item => {
    if (item.verification_level in evidenceCounts) evidenceCounts[item.verification_level] += 1;
  });

  return {
    totalRevenue,
    totalExpenses,
    totalDebt,
    netFlow,
    monthlyPayment,
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

export function calculateCapacityRatio(context) {
  if (!context.hasCashflow || context.monthlyPayment <= 0 || context.durationMonths <= 0) return null;
  return (context.netFlow / context.durationMonths) / context.monthlyPayment;
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
    return {
      triggered: capacityRatio != null && capacityRatio < 1,
      explanation: capacityRatio == null
        ? 'Capacité non calculable — données insuffisantes'
        : `Flux net insuffisant pour couvrir l'échéance (ratio: ${capacityRatio.toFixed(2)})`,
    };
  }
  if (expr === 'CAPACITY_STRESSED') {
    const stressedNet = context.totalRevenue * 0.8 - context.totalExpenses - context.totalDebt;
    const ratio = context.monthlyPayment > 0 && context.durationMonths > 0
      ? (stressedNet / context.durationMonths) / context.monthlyPayment
      : null;
    return {
      triggered: ratio != null && ratio < 1,
      explanation: ratio == null
        ? 'Capacité stressée non calculable — données insuffisantes'
        : `Capacité insuffisante sous scénario prudent -20% (ratio: ${ratio.toFixed(2)})`,
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

  const bands = {
    NON_ELIGIBLE: { min: 0, max: 39 },
    REVUE_REQUISE: { min: 40, max: 70 },
    PREQUALIFIE: { min: 71, max: 100 },
  };
  const band = bands[prequalification];
  const bandSize = band.max - band.min;
  const score = Math.round(band.min + (rawScore / 100) * bandSize);

  return {
    score,
    details: {
      version: SCORE_VERSION,
      raw_score: rawScore,
      decision_band: band,
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

export function evaluatePrequalification(dossier, cashflow, evidence, bicRecords, rules) {
  const context = buildEvaluationContext(dossier, cashflow, evidence, bicRecords);
  const capacityRatio = calculateCapacityRatio(context);
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
  const scoring = computePrequalificationScore(
    context,
    evaluations,
    decision.prequalification,
    capacityRatio,
  );
  return {
    ...decision,
    ...scoring,
    evidenceConfidence,
    repaymentCapacity,
    evaluations,
    context,
  };
}

export async function evaluateDossier(db, tenantId, dossierId) {
  const [dossierResult, cashflowResult, evidenceResult, rulesResult] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?', args: [dossierId, tenantId] }),
    db.execute({ sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ? ORDER BY year, month', args: [dossierId, tenantId] }),
    db.execute({ sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] }),
    db.execute({ sql: 'SELECT * FROM rules WHERE tenant_id = ? AND active = 1 ORDER BY code', args: [tenantId] }),
  ]);
  const dossier = dossierResult.rows[0];
  if (!dossier) return null;
  const bicResult = await db.execute({
    sql: 'SELECT * FROM bic_records WHERE tenant_id = ? AND applicant_id_number = ?',
    args: [tenantId, dossier.applicant_id_number || ''],
  });
  const result = evaluatePrequalification(
    dossier,
    cashflowResult.rows,
    evidenceResult.rows,
    bicResult.rows,
    rulesResult.rows,
  );

  const statements = [
    { sql: 'DELETE FROM rule_evaluations WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] },
    ...result.evaluations.map(evaluation => ({
      sql: `INSERT INTO rule_evaluations (id, dossier_id, rule_id, tenant_id, triggered, result, explanation, data_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(), dossierId, evaluation.rule_id, tenantId, evaluation.triggered ? 1 : 0,
        evaluation.result, evaluation.explanation, JSON.stringify(result.context),
      ],
    })),
    {
      sql: `UPDATE dossiers SET evidence_confidence = ?, repayment_capacity = ?, prequalification = ?,
            prequalification_reasons = ?, prequalification_score = ?, prequalification_score_details = ?,
            prequalification_score_version = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
      args: [
        result.evidenceConfidence, result.repaymentCapacity, result.prequalification,
        JSON.stringify(result.reasons), result.score, JSON.stringify(result.details),
        SCORE_VERSION, dossierId, tenantId,
      ],
    },
  ];
  await db.batch(statements, 'write');
  return result;
}

export async function recalculateOutdatedScores(db) {
  const dossiers = await db.execute({
    sql: `SELECT id, tenant_id FROM dossiers
          WHERE prequalification_score IS NOT NULL
          AND COALESCE(prequalification_score_version, 1) < ?`,
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
