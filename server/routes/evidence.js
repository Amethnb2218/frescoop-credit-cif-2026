import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.get('/dossier/:dossierId', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at DESC',
      args: [req.params.dossierId, req.tenantId],
    });
    res.json({ ok: true, evidence: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const data = req.body;
    const id = data.id || uuid();

    if (!data.dossier_id || !data.category || !data.label || !data.source || !data.verification_level) {
      return res.status(400).json({ error: 'Champs obligatoires: dossier_id, category, label, source, verification_level' });
    }

    const validLevels = ['A', 'B', 'C', 'D'];
    if (!validLevels.includes(data.verification_level)) {
      return res.status(400).json({ error: 'Niveau de vérification invalide (A/B/C/D)' });
    }

    await db.execute({
      sql: `INSERT INTO evidence (id, dossier_id, tenant_id, category, label, value, amount, unit,
            source, source_detail, verification_level, verified_by, verified_at, status,
            evidence_date, expires_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, data.dossier_id, req.tenantId, data.category, data.label,
        data.value || null, data.amount || null, data.unit || null,
        data.source, data.source_detail || null, data.verification_level,
        data.verified_by || null, data.verified_at || null,
        data.status || 'active', data.evidence_date || null,
        data.expires_at || null, JSON.stringify(data.metadata || {}),
      ],
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'EVIDENCE_ADDED', 'evidence', id, {
      dossier_id: data.dossier_id,
      category: data.category,
      label: data.label,
      level: data.verification_level,
    }, req);

    res.json({ ok: true, id });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id/verify', authMiddleware, tenantGuard, requireRole('SUPERVISEUR', 'RISK_MANAGER', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const { verification_level, note } = req.body;

    await db.execute({
      sql: `UPDATE evidence SET verification_level = ?, verified_by = ?, verified_at = datetime('now')
            WHERE id = ? AND tenant_id = ?`,
      args: [verification_level, req.user.id, req.params.id, req.tenantId],
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'EVIDENCE_VERIFIED', 'evidence', req.params.id, {
      new_level: verification_level, note,
    }, req);

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
