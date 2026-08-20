import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.get('/', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM rules WHERE tenant_id = ? ORDER BY code',
      args: [req.tenantId],
    });
    res.json({ ok: true, rules: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/evaluate/:dossierId', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { dossierId } = req.params;

    const dossierResult = await db.execute({
      sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });
    if (!dossierResult.rows[0]) return res.status(404).json({ error: 'Dossier introuvable' });
    const dossier = dossierResult.rows[0];

    const cashflowResult = await db.execute({
      sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ? ORDER BY year, month',
      args: [dossierId, req.tenantId],
    });

    const evidenceResult = await db.execute({
      sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });

    const bicResult = await db.execute({
      sql: 'SELECT * FROM bic_records WHERE tenant_id = ? AND applicant_id_number = ?',
      args: [req.tenantId, dossier.applicant_id_number || ''],
    });

    const rulesResult = await db.execute({
      sql: 'SELECT * FROM rules WHERE tenant_id = ? AND active = 1 ORDER BY code',
      args: [req.tenantId],
    });

    const cashflow = cashflowResult.rows;
    const evidence = evidenceResult.rows;
    const bicRecords = bicResult.rows;
    const rules = rulesResult.rows;

    const totalRevenue = cashflow.reduce((s, e) => s + (e.revenue || 0), 0);
    const totalExpenses = cashflow.reduce((s, e) => s + (e.expenses || 0), 0);
    const totalDebt = cashflow.reduce((s, e) => s + (e.debt_payments || 0), 0);
    const netFlow = totalRevenue - totalExpenses - totalDebt;
    const monthlyPayment = dossier.amount_requested && dossier.duration_months
      ? Math.ceil(dossier.amount_requested / dossier.duration_months) : 0;
    const monthsWithRevenue = cashflow.filter(e => e.revenue > 0).length;
    const evidenceACount = evidence.filter(e => e.verification_level === 'A').length;
    const evidenceBCount = evidence.filter(e => e.verification_level === 'B').length;
    const evidenceCCount = evidence.filter(e => e.verification_level === 'C').length;
    const evidenceDCount = evidence.filter(e => e.verification_level === 'D').length;
    const totalEvidence = evidence.length;
    const existingDebt = bicRecords.reduce((s, r) => s + (r.outstanding || 0), 0);
    const hasLatePayments = bicRecords.some(r => r.days_late > 30);

    const context = {
      totalRevenue, totalExpenses, totalDebt, netFlow, monthlyPayment,
      monthsWithRevenue, amountRequested: dossier.amount_requested || 0,
      durationMonths: dossier.duration_months || 0,
      evidenceACount, evidenceBCount, evidenceCCount, evidenceDCount, totalEvidence,
      existingDebt, hasLatePayments, hasIdentity: !!dossier.applicant_name,
      hasCashflow: cashflow.length > 0, surface: dossier.surface_ha || 0,
      yearsExperience: dossier.years_experience || 0,
    };

    await db.execute({
      sql: 'DELETE FROM rule_evaluations WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });

    const evaluations = [];
    const triggeredFlags = [];

    for (const rule of rules) {
      const { triggered, explanation } = evaluateRule(rule, context);
      const evalId = uuid();

      await db.execute({
        sql: `INSERT INTO rule_evaluations (id, dossier_id, rule_id, tenant_id, triggered, result, explanation, data_used)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [evalId, dossierId, rule.id, req.tenantId, triggered ? 1 : 0, triggered ? rule.result : null, explanation, JSON.stringify(context)],
      });

      evaluations.push({ id: evalId, rule_code: rule.code, rule_name: rule.name, triggered, result: triggered ? rule.result : null, explanation });

      if (triggered && rule.result === 'NON_ELIGIBLE') {
        triggeredFlags.push({ code: rule.code, severity: 'critical', label: rule.name });
      } else if (triggered && rule.result === 'REVUE_REQUISE') {
        triggeredFlags.push({ code: rule.code, severity: rule.severity, label: rule.name });
      }
    }

    // Compute Evidence Confidence
    let evidenceConfidence;
    const verifiedRatio = totalEvidence > 0 ? (evidenceACount + evidenceBCount) / totalEvidence : 0;
    if (verifiedRatio >= 0.7 && totalEvidence >= 3) evidenceConfidence = 'HIGH';
    else if (verifiedRatio >= 0.4 || totalEvidence >= 2) evidenceConfidence = 'MEDIUM';
    else evidenceConfidence = 'LOW';

    // Compute Repayment Capacity
    let repaymentCapacity;
    const capacityRatio = monthlyPayment > 0 ? (netFlow / (dossier.duration_months || 1)) / monthlyPayment : 0;
    if (capacityRatio >= 1.3) repaymentCapacity = 'SUFFICIENT';
    else if (capacityRatio >= 1.0) repaymentCapacity = 'LIMIT';
    else repaymentCapacity = 'INSUFFICIENT';

    // Determine prequalification
    const hasNonEligible = evaluations.some(e => e.triggered && e.result === 'NON_ELIGIBLE');
    const hasRevueRequise = evaluations.some(e => e.triggered && e.result === 'REVUE_REQUISE');
    let prequalification;
    let reasons = [];

    if (hasNonEligible) {
      prequalification = 'NON_ELIGIBLE';
      reasons = evaluations.filter(e => e.triggered && e.result === 'NON_ELIGIBLE').map(e => e.explanation);
    } else if (hasRevueRequise || evidenceConfidence === 'LOW' || repaymentCapacity === 'LIMIT') {
      prequalification = 'REVUE_REQUISE';
      reasons = evaluations.filter(e => e.triggered).map(e => e.explanation);
      if (evidenceConfidence === 'LOW') reasons.push('Niveau de confiance des preuves insuffisant');
      if (repaymentCapacity === 'LIMIT') reasons.push('Capacité de remboursement limite');
    } else {
      prequalification = 'PREQUALIFIE';
      reasons = ['Toutes les règles respectées', 'Capacité de remboursement suffisante', 'Preuves vérifiées'];
    }

    await db.execute({
      sql: `UPDATE dossiers SET evidence_confidence = ?, repayment_capacity = ?,
            prequalification = ?, prequalification_reasons = ?, updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?`,
      args: [evidenceConfidence, repaymentCapacity, prequalification, JSON.stringify(reasons), dossierId, req.tenantId],
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'RULES_EVALUATED', 'dossier', dossierId, {
      prequalification, evidenceConfidence, repaymentCapacity,
      rules_triggered: evaluations.filter(e => e.triggered).length,
    }, req);

    res.json({
      ok: true,
      evaluations,
      summary: { evidence_confidence: evidenceConfidence, repayment_capacity: repaymentCapacity, prequalification, reasons },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

function evaluateRule(rule, ctx) {
  try {
    const expr = rule.condition_expr;

    if (expr === 'NO_IDENTITY') {
      return { triggered: !ctx.hasIdentity, explanation: 'Identité du demandeur non renseignée' };
    }
    if (expr === 'NO_CASHFLOW') {
      return { triggered: !ctx.hasCashflow, explanation: 'Aucun flux de trésorerie renseigné' };
    }
    if (expr === 'CAPACITY_INSUFFICIENT') {
      const ratio = ctx.monthlyPayment > 0 ? (ctx.netFlow / (ctx.durationMonths || 1)) / ctx.monthlyPayment : 999;
      return { triggered: ratio < 1.0, explanation: `Flux net insuffisant pour couvrir l'échéance (ratio: ${ratio.toFixed(2)})` };
    }
    if (expr === 'CAPACITY_STRESSED') {
      const stressedRevenue = ctx.totalRevenue * 0.8;
      const stressedNet = stressedRevenue - ctx.totalExpenses - ctx.totalDebt;
      const ratio = ctx.monthlyPayment > 0 ? (stressedNet / (ctx.durationMonths || 1)) / ctx.monthlyPayment : 999;
      return { triggered: ratio < 1.0, explanation: `Capacité insuffisante sous scénario prudent -20% (ratio: ${ratio.toFixed(2)})` };
    }
    if (expr === 'HIGH_EXISTING_DEBT') {
      const debtRatio = ctx.amountRequested > 0 ? ctx.existingDebt / ctx.amountRequested : 0;
      return { triggered: debtRatio > 0.5, explanation: `Dette existante élevée (${ctx.existingDebt.toLocaleString()} FCFA, ratio: ${debtRatio.toFixed(2)})` };
    }
    if (expr === 'LATE_PAYMENTS') {
      return { triggered: ctx.hasLatePayments, explanation: 'Retards de paiement détectés au BIC (>30 jours)' };
    }
    if (expr === 'LOW_EVIDENCE') {
      return { triggered: ctx.totalEvidence < 2, explanation: `Trop peu de preuves (${ctx.totalEvidence} pièce(s))` };
    }
    if (expr === 'MOSTLY_DECLARATIVE') {
      const declRatio = ctx.totalEvidence > 0 ? ctx.evidenceDCount / ctx.totalEvidence : 0;
      return { triggered: declRatio > 0.7 && ctx.totalEvidence >= 2, explanation: `Majorité des preuves déclaratives (${Math.round(declRatio * 100)}%)` };
    }
    if (expr === 'SEASONAL_MISMATCH') {
      const hasConcentratedRevenue = ctx.monthsWithRevenue > 0 && ctx.monthsWithRevenue <= 4;
      return { triggered: hasConcentratedRevenue && ctx.durationMonths > 6, explanation: `Revenus concentrés sur ${ctx.monthsWithRevenue} mois — calendrier saisonnier recommandé` };
    }
    if (expr === 'AMOUNT_HIGH_VS_REVENUE') {
      const ratio = ctx.totalRevenue > 0 ? ctx.amountRequested / ctx.totalRevenue : 999;
      return { triggered: ratio > 0.8, explanation: `Montant demandé élevé par rapport aux revenus annuels (ratio: ${ratio.toFixed(2)})` };
    }

    return { triggered: false, explanation: 'Règle non évaluée' };
  } catch {
    return { triggered: false, explanation: 'Erreur d\'évaluation' };
  }
}

export default router;
