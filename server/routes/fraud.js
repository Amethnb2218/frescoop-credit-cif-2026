import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';
import { findAccessibleDossier } from '../services/dossierAccess.js';

const router = Router();

router.get('/dossier/:dossierId', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    if (!await findAccessibleDossier(db, req.params.dossierId, req)) {
      return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });
    }
    const result = await db.execute({
      sql: 'SELECT * FROM fraud_checks WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at DESC',
      args: [req.params.dossierId, req.tenantId],
    });
    res.json({ ok: true, checks: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/check/:dossierId', authMiddleware, tenantGuard,
  requireRole('SUPERVISEUR', 'RISK_MANAGER', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const { dossierId } = req.params;

    const dossier = await findAccessibleDossier(db, dossierId, req);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });

    const evidenceResult = await db.execute({
      sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });
    const evidence = evidenceResult.rows;

    const cashflowResult = await db.execute({
      sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });
    const cashflow = cashflowResult.rows;

    await db.execute({
      sql: 'DELETE FROM fraud_checks WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });

    const checks = [];

    // DUPLICATE_CHECK
    if (dossier.applicant_id_number || dossier.applicant_phone) {
      let dupSql = 'SELECT id, applicant_name FROM dossiers WHERE tenant_id = ? AND id != ?';
      const dupArgs = [req.tenantId, dossierId];
      const conditions = [];
      if (dossier.applicant_id_number) {
        conditions.push('applicant_id_number = ?');
        dupArgs.push(dossier.applicant_id_number);
      }
      if (dossier.applicant_phone) {
        conditions.push('applicant_phone = ?');
        dupArgs.push(dossier.applicant_phone);
      }
      dupSql += ` AND (${conditions.join(' OR ')})`;
      const dups = await db.execute({ sql: dupSql, args: dupArgs });
      const hasDup = dups.rows.length > 0;
      checks.push({
        check_type: 'DUPLICATE_CHECK',
        result: hasDup ? 'flag' : 'pass',
        details: hasDup ? { duplicates: dups.rows.map(d => ({ id: d.id, name: d.applicant_name })) } : {},
        severity: hasDup ? 'high' : 'low',
      });
    }

    // AMOUNT_COHERENCE
    const totalRevenue = cashflow.reduce((s, e) => s + (e.revenue || 0), 0);
    if (dossier.amount_requested && totalRevenue > 0) {
      const ratio = dossier.amount_requested / totalRevenue;
      const incoherent = ratio > 1.5;
      checks.push({
        check_type: 'AMOUNT_COHERENCE',
        result: incoherent ? 'flag' : 'pass',
        details: { amount_requested: dossier.amount_requested, total_annual_revenue: totalRevenue, ratio: Math.round(ratio * 100) / 100 },
        severity: incoherent ? 'medium' : 'low',
      });
    }

    // EVIDENCE_COHERENCE
    const evidenceRevenue = evidence
      .filter(e => ['VENTE', 'LIVRAISON'].includes(e.category) && e.amount)
      .reduce((s, e) => s + (e.amount || 0), 0);
    if (totalRevenue > 0 && evidenceRevenue > 0) {
      const evRatio = evidenceRevenue / totalRevenue;
      const mismatch = evRatio < 0.3 || evRatio > 3.0;
      checks.push({
        check_type: 'EVIDENCE_COHERENCE',
        result: mismatch ? 'flag' : 'pass',
        details: { evidence_total: evidenceRevenue, cashflow_revenue: totalRevenue, ratio: Math.round(evRatio * 100) / 100 },
        severity: mismatch ? 'medium' : 'low',
      });
    }

    // TEMPORAL_COHERENCE
    const now = new Date().toISOString().split('T')[0];
    const futureEvidence = evidence.filter(e => e.evidence_date && e.evidence_date > now);
    checks.push({
      check_type: 'TEMPORAL_COHERENCE',
      result: futureEvidence.length > 0 ? 'alert' : 'pass',
      details: futureEvidence.length > 0 ? { future_dates: futureEvidence.map(e => ({ label: e.label, date: e.evidence_date })) } : {},
      severity: futureEvidence.length > 0 ? 'high' : 'low',
    });

    for (const check of checks) {
      await db.execute({
        sql: `INSERT INTO fraud_checks (id, dossier_id, tenant_id, check_type, result, details, severity)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [uuid(), dossierId, req.tenantId, check.check_type, check.result, JSON.stringify(check.details), check.severity],
      });
    }

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'FRAUD_CHECK_RUN', 'dossier', dossierId, {
      total_checks: checks.length,
      flags: checks.filter(c => c.result !== 'pass').length,
    }, req);

    res.json({ ok: true, checks });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

export default router;
