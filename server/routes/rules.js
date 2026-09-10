import { Router } from 'express';
import { getDb } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';
import { evaluateDossier } from '../services/prequalification.js';
import { findAccessibleDossier } from '../services/dossierAccess.js';

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

router.post('/evaluate/:dossierId', authMiddleware, tenantGuard,
  requireRole('SUPERVISEUR', 'RISK_MANAGER', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const { dossierId } = req.params;
    if (!await findAccessibleDossier(db, dossierId, req)) {
      return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });
    }
    const previous = await db.execute({
      sql: 'SELECT prequalification_score, prequalification_score_version FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });
    if (!previous.rows[0]) return res.status(404).json({ error: 'Dossier introuvable' });

    const result = await evaluateDossier(db, req.tenantId, dossierId);
    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'RULES_EVALUATED', 'dossier', dossierId, {
      prequalification: result.prequalification,
      evidenceConfidence: result.evidenceConfidence,
      repaymentCapacity: result.repaymentCapacity,
      previous_score: previous.rows[0].prequalification_score,
      score: result.score,
      score_version: result.details.version,
      rules_triggered: result.evaluations.filter(item => item.triggered).length,
    }, req);

    res.json({
      ok: true,
      evaluations: result.evaluations,
      summary: {
        evidence_confidence: result.evidenceConfidence,
        repayment_capacity: result.repaymentCapacity,
        prequalification: result.prequalification,
        reasons: result.reasons,
        score: result.score,
        score_breakdown: result.details,
        score_version: result.details.version,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

export default router;
