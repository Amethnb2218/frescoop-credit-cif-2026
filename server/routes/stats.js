import { Router } from 'express';
import { getDb } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { summarizeDossierFinancials } from '../services/loanFinancials.js';

const router = Router();

router.get('/', authMiddleware, tenantGuard, requireRole('ADMIN', 'SUPERADMIN', 'RISK_MANAGER', 'SUPERVISEUR', 'AUDITEUR', 'JURY', 'SUPPORT'), async (req, res) => {
  try {
    const db = getDb();
    const tid = req.tenantId;

    const totalResult = await db.execute({ sql: 'SELECT COUNT(*) as count FROM dossiers WHERE tenant_id = ?', args: [tid] });
    const total = totalResult.rows[0].count;

    const byStatusResult = await db.execute({ sql: 'SELECT status, COUNT(*) as count FROM dossiers WHERE tenant_id = ? GROUP BY status', args: [tid] });
    const byStatus = {};
    byStatusResult.rows.forEach(r => { byStatus[r.status] = r.count; });

    const decidedResult = await db.execute({
      sql: "SELECT created_at, decided_at FROM dossiers WHERE tenant_id = ? AND decided_at IS NOT NULL",
      args: [tid],
    });
    let avgDays = 0;
    if (decidedResult.rows.length > 0) {
      const totalDays = decidedResult.rows.reduce((sum, r) => {
        const created = new Date(r.created_at);
        const decided = new Date(r.decided_at);
        return sum + (decided - created) / (1000 * 60 * 60 * 24);
      }, 0);
      avgDays = Math.round(totalDays / decidedResult.rows.length);
    }

    const requiredFields = ['applicant_name', 'applicant_phone', 'applicant_id_number', 'applicant_location', 'amount_requested', 'duration_months', 'credit_purpose', 'sector'];
    const allDossiers = await db.execute({ sql: 'SELECT * FROM dossiers WHERE tenant_id = ?', args: [tid] });
    const assessmentResult = await db.execute({
      sql: 'SELECT dossier_id, calculated_metrics FROM agricultural_project_assessments WHERE tenant_id = ?',
      args: [tid],
    });
    const financials = summarizeDossierFinancials(allDossiers.rows, assessmentResult.rows);
    let completeCount = 0;
    for (const d of allDossiers.rows) {
      const isComplete = requiredFields.every(f => d[f] != null && d[f] !== '');
      if (isComplete) completeCount++;
    }
    const completionRate = total > 0 ? Math.round((completeCount / total) * 100) : 0;

    const overrideResult = await db.execute({
      sql: "SELECT COUNT(*) as count FROM dossiers WHERE tenant_id = ? AND decision IS NOT NULL AND decision_amount IS NOT NULL AND decision_amount != amount_requested",
      args: [tid],
    });
    const totalDecisions = decidedResult.rows.length;
    const overrides = overrideResult.rows[0].count;
    const overrideRate = totalDecisions > 0 ? Math.round((overrides / totalDecisions) * 100) : 0;

    const prequalResult = await db.execute({
      sql: "SELECT prequalification, COUNT(*) as count FROM dossiers WHERE tenant_id = ? AND prequalification IS NOT NULL GROUP BY prequalification",
      args: [tid],
    });
    const prequalDistribution = {};
    prequalResult.rows.forEach(r => { prequalDistribution[r.prequalification] = r.count; });

    res.json({
      ok: true,
      stats: {
        total_dossiers: total,
        dossiers_by_status: byStatus,
        average_processing_days: avgDays,
        completion_rate: completionRate,
        override_rate: overrideRate,
        total_decisions: totalDecisions,
        total_overrides: overrides,
        prequalification_distribution: prequalDistribution,
        total_amount: financials.total_repayable,
        average_amount: total > 0 ? Math.round(financials.total_repayable / total) : 0,
        financials,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

export default router;
