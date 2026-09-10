import { createHash } from 'crypto';
import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';
import { scoreInvalidationStatement } from '../services/dossierAccess.js';

const router = Router();
const VALID_LEVELS = ['A', 'B', 'C', 'D'];
const VALID_STATUSES = ['active', 'expired', 'disputed', 'superseded'];
const VALID_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const MAX_DOSSIER_ATTACHMENTS_SIZE = 10 * 1024 * 1024;

export function decodeAttachment(data) {
  const mimeType = String(data.mime_type || '').toLowerCase();
  if (!VALID_MIME_TYPES.has(mimeType)) throw new Error('Type de fichier invalide. Utilisez PDF, JPEG ou PNG.');
  if (typeof data.content_base64 !== 'string' || !data.content_base64) throw new Error('Contenu du fichier requis.');
  const content = Buffer.from(data.content_base64, 'base64');
  if (content.length === 0 || content.length > MAX_ATTACHMENT_SIZE) throw new Error('Le fichier doit avoir une taille maximale de 2 Mo.');
  const isPdf = content.subarray(0, 5).toString() === '%PDF-';
  const isJpeg = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  const isPng = content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if ((mimeType === 'application/pdf' && !isPdf) || (mimeType === 'image/jpeg' && !isJpeg)
    || (mimeType === 'image/png' && !isPng)) throw new Error('Le contenu du fichier ne correspond pas au type déclaré.');
  return { mimeType, content };
}

async function ownedDossier(db, dossierId, req) {
  let sql = 'SELECT id, agent_id, status FROM dossiers WHERE id = ? AND tenant_id = ?';
  const args = [dossierId, req.tenantId];
  if (req.user.role === 'AGENT') { sql += ' AND agent_id = ?'; args.push(req.user.id); }
  const result = await db.execute({ sql, args });
  return result.rows[0];
}

router.get('/dossier/:dossierId', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    if (!await ownedDossier(db, req.params.dossierId, req)) {
      return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });
    }
    const result = await db.execute({
      sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at DESC',
      args: [req.params.dossierId, req.tenantId],
    });
    res.json({ ok: true, evidence: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/attachment', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: `SELECT a.original_name, a.mime_type, a.size_bytes, a.content, d.agent_id
            FROM evidence_attachments a
            JOIN dossiers d ON d.id = a.dossier_id AND d.tenant_id = a.tenant_id
            WHERE a.evidence_id = ? AND a.tenant_id = ?`,
      args: [req.params.id, req.tenantId],
    });
    const attachment = result.rows[0];
    if (!attachment || (req.user.role === 'AGENT' && attachment.agent_id !== req.user.id)) {
      return res.status(404).json({ error: 'Pièce jointe introuvable ou non autorisée' });
    }
    const content = Buffer.isBuffer(attachment.content)
      ? attachment.content
      : Buffer.from(attachment.content || []);
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Length', String(attachment.size_bytes));
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(content);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.put('/:id/attachment', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const current = await db.execute({
      sql: `SELECT e.dossier_id, d.agent_id, d.status AS dossier_status
            FROM evidence e JOIN dossiers d ON d.id = e.dossier_id AND d.tenant_id = e.tenant_id
            WHERE e.id = ? AND e.tenant_id = ?`,
      args: [req.params.id, req.tenantId],
    });
    const evidence = current.rows[0];
    if (!evidence || (req.user.role === 'AGENT' && evidence.agent_id !== req.user.id)) {
      return res.status(404).json({ error: 'Preuve introuvable ou non autorisée' });
    }
    if (!['draft', 'incomplete'].includes(evidence.dossier_status)) {
      return res.status(409).json({ error: 'La pièce jointe ne peut être modifiée que sur un brouillon' });
    }
    let decoded;
    try { decoded = decodeAttachment(req.body); } catch (err) { return res.status(400).json({ error: err.message }); }
    const totals = await db.execute({
      sql: `SELECT COALESCE(SUM(size_bytes), 0) AS total FROM evidence_attachments
            WHERE dossier_id = ? AND tenant_id = ? AND evidence_id <> ?`,
      args: [evidence.dossier_id, req.tenantId, req.params.id],
    });
    if (Number(totals.rows[0].total) + decoded.content.length > MAX_DOSSIER_ATTACHMENTS_SIZE) {
      return res.status(413).json({ error: 'La taille totale des pièces jointes est limitée à 10 Mo par dossier.' });
    }
    const sha256 = createHash('sha256').update(decoded.content).digest('hex');
    await db.execute({
      sql: `INSERT INTO evidence_attachments
            (id, evidence_id, dossier_id, tenant_id, original_name, mime_type, size_bytes, sha256, content, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tenant_id, evidence_id) DO UPDATE SET original_name = excluded.original_name,
              mime_type = excluded.mime_type, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
              content = excluded.content, created_by = excluded.created_by, updated_at = datetime('now')`,
      args: [uuid(), req.params.id, evidence.dossier_id, req.tenantId,
        String(req.body.original_name || 'piece-jointe').slice(0, 255), decoded.mimeType,
        decoded.content.length, sha256, decoded.content, req.user.id],
    });
    const metadata = { file_name: req.body.original_name, file_type: decoded.mimeType,
      file_size: decoded.content.length, sha256, upload_pending: false };
    await db.execute({ sql: 'UPDATE evidence SET metadata = ? WHERE id = ? AND tenant_id = ?',
      args: [JSON.stringify(metadata), req.params.id, req.tenantId] });
    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'EVIDENCE_ATTACHMENT_SAVED', 'evidence', req.params.id,
      { dossier_id: evidence.dossier_id, mime_type: decoded.mimeType, size: decoded.content.length, sha256 }, req);
    res.json({ ok: true, evidence_id: req.params.id, size: decoded.content.length, sha256 });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.delete('/:id/attachment', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const current = await db.execute({
      sql: `SELECT e.dossier_id, d.agent_id, d.status AS dossier_status
            FROM evidence e JOIN dossiers d ON d.id = e.dossier_id AND d.tenant_id = e.tenant_id
            WHERE e.id = ? AND e.tenant_id = ?`,
      args: [req.params.id, req.tenantId],
    });
    const evidence = current.rows[0];
    if (!evidence || (req.user.role === 'AGENT' && evidence.agent_id !== req.user.id)) {
      return res.status(404).json({ error: 'Preuve introuvable ou non autorisée' });
    }
    if (!['draft', 'incomplete'].includes(evidence.dossier_status)) {
      return res.status(409).json({ error: 'La pièce jointe ne peut être supprimée que sur un brouillon' });
    }
    await db.execute({ sql: 'DELETE FROM evidence_attachments WHERE evidence_id = ? AND tenant_id = ?', args: [req.params.id, req.tenantId] });
    await db.execute({ sql: "UPDATE evidence SET metadata = '{}' WHERE id = ? AND tenant_id = ?", args: [req.params.id, req.tenantId] });
    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'EVIDENCE_ATTACHMENT_DELETED', 'evidence', req.params.id,
      { dossier_id: evidence.dossier_id }, req);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
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

    const dossier = await ownedDossier(db, data.dossier_id, req);
    if (!dossier) {
      return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });
    }
    if (!['draft', 'incomplete'].includes(dossier.status)) {
      return res.status(409).json({ error: 'La preuve ne peut être ajoutée que sur un brouillon' });
    }
    if (!VALID_LEVELS.includes(data.verification_level)) {
      return res.status(400).json({ error: 'Niveau de vérification invalide (A/B/C/D)' });
    }
    if (req.user.role === 'AGENT' && !['C', 'D'].includes(data.verification_level)) {
      return res.status(403).json({ error: 'Un agent ne peut enregistrer qu’une preuve de niveau C ou D.' });
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

router.put('/:id', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const current = await db.execute({
      sql: `SELECT e.*, d.agent_id, d.status AS dossier_status FROM evidence e
            JOIN dossiers d ON d.id = e.dossier_id AND d.tenant_id = e.tenant_id
            WHERE e.id = ? AND e.tenant_id = ?`,
      args: [req.params.id, req.tenantId],
    });
    const evidence = current.rows[0];
    if (!evidence || (req.user.role === 'AGENT' && evidence.agent_id !== req.user.id)) {
      return res.status(404).json({ error: 'Preuve introuvable ou non autorisée' });
    }
    if (!['draft', 'incomplete'].includes(evidence.dossier_status)) {
      return res.status(409).json({ error: 'La preuve ne peut être modifiée que sur un brouillon' });
    }
    const fields = ['category', 'label', 'value', 'amount', 'unit', 'source', 'source_detail', 'status', 'evidence_date', 'expires_at', 'metadata'];
    const updates = [];
    const args = [];
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        if (field === 'status' && !VALID_STATUSES.includes(req.body[field])) return res.status(400).json({ error: 'Statut de preuve invalide' });
        updates.push(`${field} = ?`);
        args.push(field === 'metadata' ? JSON.stringify(req.body[field] || {}) : req.body[field]);
      }
    }
    if (!updates.length) return res.json({ ok: true, id: req.params.id });
    args.push(req.params.id, req.tenantId);
    await db.execute({ sql: `UPDATE evidence SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, args });
    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'EVIDENCE_UPDATED', 'evidence', req.params.id, { fields: Object.keys(req.body) }, req);
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.delete('/:id', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const current = await db.execute({
      sql: `SELECT e.dossier_id, d.agent_id, d.status FROM evidence e
            JOIN dossiers d ON d.id = e.dossier_id AND d.tenant_id = e.tenant_id
            WHERE e.id = ? AND e.tenant_id = ?`,
      args: [req.params.id, req.tenantId],
    });
    const evidence = current.rows[0];
    if (!evidence || (req.user.role === 'AGENT' && evidence.agent_id !== req.user.id)) {
      return res.status(404).json({ error: 'Preuve introuvable ou non autorisée' });
    }
    if (!['draft', 'incomplete'].includes(evidence.status)) {
      return res.status(409).json({ error: 'La preuve ne peut être supprimée que sur un brouillon' });
    }
    await db.batch([
      { sql: 'DELETE FROM evidence_attachments WHERE evidence_id = ? AND tenant_id = ?', args: [req.params.id, req.tenantId] },
      { sql: 'DELETE FROM evidence WHERE id = ? AND tenant_id = ?', args: [req.params.id, req.tenantId] },
    ], 'write');
    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'EVIDENCE_DELETED', 'evidence', req.params.id, { dossier_id: evidence.dossier_id }, req);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.put('/:id/verify', authMiddleware, tenantGuard, requireRole('SUPERVISEUR', 'RISK_MANAGER', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const { verification_level, note } = req.body;
    if (!VALID_LEVELS.includes(verification_level)) {
      return res.status(400).json({ error: 'Niveau de vérification invalide (A/B/C/D)' });
    }

    const existing = await db.execute({
      sql: 'SELECT id FROM evidence WHERE id = ? AND tenant_id = ?',
      args: [req.params.id, req.tenantId],
    });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Preuve introuvable' });

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
