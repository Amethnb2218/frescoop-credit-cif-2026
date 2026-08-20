import { Router } from 'express';
import { getDb } from '../db.js';
import { authMiddleware, tenantGuard } from '../auth.js';

const router = Router();

router.get('/:dossierId', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { dossierId } = req.params;

    const dossierResult = await db.execute({
      sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });
    if (!dossierResult.rows[0]) return res.status(404).json({ error: 'Dossier introuvable' });
    const dossier = dossierResult.rows[0];

    const evidenceResult = await db.execute({
      sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ? ORDER BY verification_level, created_at DESC',
      args: [dossierId, req.tenantId],
    });

    const cashflowResult = await db.execute({
      sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ? ORDER BY year, month',
      args: [dossierId, req.tenantId],
    });

    const flagsResult = await db.execute({
      sql: 'SELECT * FROM risk_flags WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });

    const stressResult = await db.execute({
      sql: 'SELECT * FROM stress_tests WHERE dossier_id = ? AND tenant_id = ? ORDER BY computed_at DESC LIMIT 5',
      args: [dossierId, req.tenantId],
    });

    const bicResult = await db.execute({
      sql: 'SELECT * FROM bic_records WHERE tenant_id = ? AND applicant_id_number = ?',
      args: [req.tenantId, dossier.applicant_id_number || ''],
    });

    const ruleEvalsResult = await db.execute({
      sql: `SELECT re.*, r.code, r.name FROM rule_evaluations re JOIN rules r ON re.rule_id = r.id
            WHERE re.dossier_id = ? AND re.triggered = 1 ORDER BY re.evaluated_at DESC`,
      args: [dossierId],
    });

    const evidence = evidenceResult.rows;
    const cashflow = cashflowResult.rows;
    const flags = flagsResult.rows;
    const stressTests = stressResult.rows;
    const bicRecords = bicResult.rows;
    const triggeredRules = ruleEvalsResult.rows;

    const totalRevenue = cashflow.reduce((s, e) => s + (e.revenue || 0), 0);
    const totalExpenses = cashflow.reduce((s, e) => s + (e.expenses || 0), 0);
    const totalDebt = cashflow.reduce((s, e) => s + (e.debt_payments || 0), 0);
    const netFlow = totalRevenue - totalExpenses - totalDebt;
    const monthlyPayment = dossier.amount_requested && dossier.duration_months
      ? Math.ceil(dossier.amount_requested / dossier.duration_months) : 0;

    const monthsWithRevenue = cashflow.filter(e => e.revenue > 0).length;
    const monthsOfTension = cashflow.filter(e => {
      const net = (e.revenue || 0) - (e.expenses || 0) - (e.debt_payments || 0);
      return net < monthlyPayment;
    }).length;

    const evidenceByLevel = { A: 0, B: 0, C: 0, D: 0 };
    evidence.forEach(e => { if (evidenceByLevel[e.verification_level] !== undefined) evidenceByLevel[e.verification_level]++; });

    const memo = {
      generated_at: new Date().toISOString(),
      is_demo: true,

      identity: {
        name: dossier.applicant_name,
        phone: dossier.applicant_phone,
        id_number: dossier.applicant_id_number,
        location: dossier.applicant_location,
        activity: dossier.applicant_activity,
      },

      request: {
        amount: dossier.amount_requested,
        purpose: dossier.credit_purpose,
        duration_months: dossier.duration_months,
        schedule: dossier.desired_schedule,
      },

      activity: {
        sector: dossier.sector,
        type: dossier.activity_type,
        experience_years: dossier.years_experience,
        surface_ha: dossier.surface_ha,
        cycle: dossier.production_cycle,
      },

      cashflow_summary: {
        total_revenue: totalRevenue,
        total_expenses: totalExpenses,
        total_debt: totalDebt,
        net_flow: netFlow,
        monthly_payment: monthlyPayment,
        months_with_revenue: monthsWithRevenue,
        months_of_tension: monthsOfTension,
        seasonal: monthsWithRevenue <= 5,
      },

      stress_tests: stressTests.map(s => ({
        scenario: s.description,
        can_repay: !!s.can_repay,
        monthly_capacity: s.monthly_capacity,
        margin_percent: s.margin_percent,
        recommendation: s.recommendation,
      })),

      evidence_summary: {
        total: evidence.length,
        by_level: evidenceByLevel,
        confidence: dossier.evidence_confidence,
        major_evidence: evidence.slice(0, 5).map(e => ({
          label: e.label,
          level: e.verification_level,
          source: e.source,
          amount: e.amount,
        })),
      },

      bic: {
        records_found: bicRecords.length,
        total_outstanding: bicRecords.reduce((s, r) => s + (r.outstanding || 0), 0),
        has_late_payments: bicRecords.some(r => r.days_late > 30),
        is_simulated: true,
      },

      risk_flags: flags.map(f => ({ code: f.code, label: f.label, severity: f.severity, status: f.status })),

      triggered_rules: triggeredRules.map(r => ({ code: r.code, name: r.name, result: r.result, explanation: r.explanation })),

      prequalification: {
        result: dossier.prequalification,
        evidence_confidence: dossier.evidence_confidence,
        repayment_capacity: dossier.repayment_capacity,
        reasons: JSON.parse(dossier.prequalification_reasons || '[]'),
      },

      guarantees: {
        savings: dossier.savings_amount,
        type: dossier.guarantee_type,
        group: dossier.group_guarantee,
        other: dossier.other_guarantees,
      },

      agent_note: dossier.agent_note,

      limitations: [
        'Les stress tests utilisent des variations configurables et ne constituent pas des prédictions.',
        'Les données BIC sont simulées pour la démonstration.',
        'La décision finale appartient au comité de crédit.',
      ],

      decision: dossier.decision ? {
        result: dossier.decision,
        amount: dossier.decision_amount,
        duration: dossier.decision_duration,
        motif: dossier.decision_motif,
        decided_at: dossier.decided_at,
        is_override: dossier.decision_amount && dossier.decision_amount !== dossier.amount_requested,
      } : null,
    };

    res.json({ ok: true, memo });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

export default router;
