import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';
import { findAccessibleDossier, isEditableDraft, scoreInvalidationStatement } from '../services/dossierAccess.js';

const router = Router();

router.get('/dossier/:dossierId', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    if (!await findAccessibleDossier(db, req.params.dossierId, req)) {
      return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });
    }
    const result = await db.execute({
      sql: 'SELECT * FROM consent_records WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at DESC',
      args: [req.params.dossierId, req.tenantId],
    });
    res.json({ ok: true, consents: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const { dossier_id, applicant_name, consent_type, consent_given, consent_date, consent_method, witness } = req.body;

    if (!dossier_id || !consent_type) {
      return res.status(400).json({ error: 'dossier_id et consent_type requis' });
    }
    const dossier = await findAccessibleDossier(db, dossier_id, req);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });
    if (!isEditableDraft(dossier)) {
      return res.status(409).json({ error: 'Le consentement ne peut être ajouté que sur un brouillon' });
    }

    const validTypes = ['data_collection', 'bic_check', 'credit_check', 'data_sharing', 'processing'];
    if (!validTypes.includes(consent_type)) {
      return res.status(400).json({ error: `consent_type invalide. Valeurs possibles: ${validTypes.join(', ')}` });
    }

    const id = uuid();
    const statements = [{
      sql: `INSERT INTO consent_records (id, dossier_id, tenant_id, applicant_name, consent_type, consent_given, consent_date, consent_method, witness)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, dossier_id, req.tenantId, applicant_name || null, consent_type, consent_given ? 1 : 0, consent_date || new Date().toISOString().split('T')[0], consent_method || null, witness || null],
    }];
    if (consent_type === 'bic_check') statements.push(scoreInvalidationStatement(dossier_id, req.tenantId));
    await db.batch(statements, 'write');

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'CONSENT_RECORDED', 'consent', id, { dossier_id, consent_type, consent_given }, req);
    res.json({ ok: true, id });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
