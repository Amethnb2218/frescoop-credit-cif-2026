import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';

const router = Router();

export async function logAudit(tenantId, userId, userName, userRole, action, entityType, entityId, details = {}, req = null) {
  try {
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO audit_log (id, tenant_id, user_id, user_name, user_role, action, entity_type, entity_id, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        uuid(),
        tenantId,
        userId,
        userName,
        userRole,
        action,
        entityType || null,
        entityId || null,
        JSON.stringify(details),
        req?.ip || null,
      ],
    });
  } catch {}
}

router.get('/', authMiddleware, tenantGuard, requireRole('ADMIN', 'AUDITEUR', 'RISK_MANAGER', 'SUPERVISEUR'), async (req, res) => {
  try {
    const db = getDb();
    const { entity_type, entity_id, user_id, action, limit = 100, offset = 0 } = req.query;

    let sql = 'SELECT * FROM audit_log WHERE tenant_id = ?';
    const args = [req.tenantId];

    if (entity_type) { sql += ' AND entity_type = ?'; args.push(entity_type); }
    if (entity_id) { sql += ' AND entity_id = ?'; args.push(entity_id); }
    if (user_id) { sql += ' AND user_id = ?'; args.push(user_id); }
    if (action) { sql += ' AND action = ?'; args.push(action); }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    args.push(Number(limit), Number(offset));

    const result = await db.execute({ sql, args });
    res.json({ ok: true, logs: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/dossier/:dossierId', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM audit_log WHERE tenant_id = ? AND entity_id = ? ORDER BY created_at ASC',
      args: [req.tenantId, req.params.dossierId],
    });
    res.json({ ok: true, logs: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
