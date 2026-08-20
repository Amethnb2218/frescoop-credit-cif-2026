import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.post('/push', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { operations } = req.body;

    if (!Array.isArray(operations)) {
      return res.status(400).json({ error: 'Tableau d\'opérations requis' });
    }

    const results = [];

    for (const op of operations) {
      const { operation, entity_type, entity_id, payload, local_timestamp } = op;

      const existing = await db.execute({
        sql: 'SELECT id FROM sync_queue WHERE entity_id = ? AND local_timestamp = ? AND tenant_id = ?',
        args: [entity_id, local_timestamp, req.tenantId],
      });

      if (existing.rows.length > 0) {
        results.push({ entity_id, status: 'duplicate', message: 'Opération déjà traitée' });
        continue;
      }

      try {
        if (entity_type === 'dossier') {
          await processDossierOp(db, operation, entity_id, payload, req);
        } else if (entity_type === 'evidence') {
          await processEvidenceOp(db, operation, entity_id, payload, req);
        } else if (entity_type === 'cashflow') {
          await processCashflowOp(db, operation, entity_id, payload, req);
        }

        await db.execute({
          sql: `INSERT INTO sync_queue (id, tenant_id, user_id, operation, entity_type, entity_id, payload, local_timestamp, status, server_timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', datetime('now'))`,
          args: [uuid(), req.tenantId, req.user.id, operation, entity_type, entity_id, JSON.stringify(payload), local_timestamp],
        });

        results.push({ entity_id, status: 'synced' });
      } catch (err) {
        await db.execute({
          sql: `INSERT INTO sync_queue (id, tenant_id, user_id, operation, entity_type, entity_id, payload, local_timestamp, status, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?)`,
          args: [uuid(), req.tenantId, req.user.id, operation, entity_type, entity_id, JSON.stringify(payload), local_timestamp, err.message],
        });
        results.push({ entity_id, status: 'failed', error: err.message });
      }
    }

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'SYNC_PUSH', 'sync', null, {
      total: operations.length,
      synced: results.filter(r => r.status === 'synced').length,
      failed: results.filter(r => r.status === 'failed').length,
      duplicate: results.filter(r => r.status === 'duplicate').length,
    }, req);

    res.json({ ok: true, results });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/pull', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { since } = req.query;

    let sql = 'SELECT * FROM dossiers WHERE tenant_id = ?';
    const args = [req.tenantId];

    if (req.user.role === 'AGENT') {
      sql += ' AND agent_id = ?';
      args.push(req.user.id);
    }

    if (since) {
      sql += ' AND updated_at > ?';
      args.push(since);
    }

    sql += ' ORDER BY updated_at DESC';
    const dossiers = await db.execute({ sql, args });

    res.json({
      ok: true,
      dossiers: dossiers.rows,
      server_timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/status', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const pending = await db.execute({
      sql: "SELECT COUNT(*) as count FROM sync_queue WHERE tenant_id = ? AND user_id = ? AND status = 'pending'",
      args: [req.tenantId, req.user.id],
    });
    const failed = await db.execute({
      sql: "SELECT COUNT(*) as count FROM sync_queue WHERE tenant_id = ? AND user_id = ? AND status = 'failed'",
      args: [req.tenantId, req.user.id],
    });
    res.json({ ok: true, pending: pending.rows[0].count, failed: failed.rows[0].count });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

async function processDossierOp(db, operation, entityId, payload, req) {
  if (operation === 'create') {
    await db.execute({
      sql: `INSERT OR IGNORE INTO dossiers (id, tenant_id, local_id, agent_id, status,
            applicant_name, applicant_phone, applicant_id_number, applicant_location, applicant_activity,
            sector, activity_type, years_experience, surface_ha, production_cycle,
            amount_requested, credit_purpose, duration_months, desired_schedule,
            savings_amount, guarantee_type, group_guarantee, other_guarantees, agent_note, created_offline)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [
        entityId, req.tenantId, payload.local_id || null, req.user.id, payload.status || 'draft',
        payload.applicant_name || null, payload.applicant_phone || null, payload.applicant_id_number || null,
        payload.applicant_location || null, payload.applicant_activity || null,
        payload.sector || null, payload.activity_type || null, payload.years_experience || null,
        payload.surface_ha || null, payload.production_cycle || null,
        payload.amount_requested || null, payload.credit_purpose || null,
        payload.duration_months || null, payload.desired_schedule || null,
        payload.savings_amount || null, payload.guarantee_type || null,
        payload.group_guarantee || null, payload.other_guarantees || null, payload.agent_note || null,
      ],
    });
  } else if (operation === 'update') {
    const fields = Object.keys(payload).filter(k => k !== 'id' && k !== 'tenant_id');
    if (fields.length === 0) return;
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => payload[f]);
    values.push(entityId, req.tenantId);
    await db.execute({
      sql: `UPDATE dossiers SET ${sets}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
      args: values,
    });
  }
}

async function processEvidenceOp(db, operation, entityId, payload, req) {
  if (operation === 'create') {
    await db.execute({
      sql: `INSERT OR IGNORE INTO evidence (id, dossier_id, tenant_id, category, label, value, amount, unit,
            source, source_detail, verification_level, evidence_date, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entityId, payload.dossier_id, req.tenantId, payload.category, payload.label,
        payload.value || null, payload.amount || null, payload.unit || null,
        payload.source, payload.source_detail || null, payload.verification_level,
        payload.evidence_date || null, JSON.stringify(payload.metadata || {}),
      ],
    });
  }
}

async function processCashflowOp(db, operation, entityId, payload, req) {
  if (operation === 'create' || operation === 'update') {
    await db.execute({ sql: 'DELETE FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ?', args: [entityId, req.tenantId] });
    for (const entry of (payload.entries || [])) {
      await db.execute({
        sql: `INSERT INTO cashflow_entries (id, dossier_id, tenant_id, month, year, revenue, expenses, debt_payments)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [uuid(), entityId, req.tenantId, entry.month, entry.year || 2026, entry.revenue || 0, entry.expenses || 0, entry.debt_payments || 0],
      });
    }
  }
}

export default router;
