import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.get('/dossier/:dossierId', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM field_visits WHERE dossier_id = ? AND tenant_id = ? ORDER BY visit_date DESC',
      args: [req.params.dossierId, req.tenantId],
    });
    res.json({ ok: true, visits: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN', 'JURY', 'SUPPORT'), async (req, res) => {
  try {
    const db = getDb();
    const { dossier_id, visit_date, gps_lat, gps_lon, observations, photos_count, activity_confirmed, surface_observed } = req.body;

    if (!dossier_id) {
      return res.status(400).json({ error: 'dossier_id requis' });
    }

    const actualDate = visit_date || new Date().toISOString().split('T')[0];
    const id = uuid();
    await db.execute({
      sql: `INSERT INTO field_visits (id, dossier_id, tenant_id, agent_id, visit_date, gps_lat, gps_lon, observations, photos_count, activity_confirmed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, dossier_id, req.tenantId, req.user.id, actualDate, gps_lat || null, gps_lon || null, observations || null, photos_count || 0, activity_confirmed ? 1 : 0],
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'FIELD_VISIT_CREATED', 'field_visit', id, { dossier_id, activity_confirmed }, req);
    res.json({ ok: true, id });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
