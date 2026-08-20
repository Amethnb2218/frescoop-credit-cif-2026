import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.get('/', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    let sql = 'SELECT * FROM dossiers WHERE tenant_id = ?';
    const args = [req.tenantId];

    if (req.user.role === 'AGENT') {
      sql += ' AND agent_id = ?';
      args.push(req.user.id);
    }

    const { status } = req.query;
    if (status) { sql += ' AND status = ?'; args.push(status); }

    sql += ' ORDER BY updated_at DESC';
    const result = await db.execute({ sql, args });
    res.json({ ok: true, dossiers: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [req.params.id, req.tenantId],
    });
    const dossier = result.rows[0];
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    const evidence = await db.execute({
      sql: 'SELECT * FROM evidence WHERE dossier_id = ? ORDER BY created_at DESC',
      args: [req.params.id],
    });

    const cashflow = await db.execute({
      sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? ORDER BY year, month',
      args: [req.params.id],
    });

    const flags = await db.execute({
      sql: 'SELECT * FROM risk_flags WHERE dossier_id = ? ORDER BY created_at DESC',
      args: [req.params.id],
    });

    const stressTests = await db.execute({
      sql: 'SELECT * FROM stress_tests WHERE dossier_id = ? ORDER BY computed_at DESC',
      args: [req.params.id],
    });

    const ruleEvals = await db.execute({
      sql: `SELECT re.*, r.code, r.name, r.description FROM rule_evaluations re
            JOIN rules r ON re.rule_id = r.id
            WHERE re.dossier_id = ? ORDER BY re.evaluated_at DESC`,
      args: [req.params.id],
    });

    res.json({
      ok: true,
      dossier,
      evidence: evidence.rows,
      cashflow: cashflow.rows,
      risk_flags: flags.rows,
      stress_tests: stressTests.rows,
      rule_evaluations: ruleEvals.rows,
    });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const id = req.body.id || uuid();
    const data = req.body;

    await db.execute({
      sql: `INSERT INTO dossiers (id, tenant_id, local_id, agent_id, status,
            applicant_name, applicant_phone, applicant_id_number, applicant_location, applicant_activity,
            sector, activity_type, years_experience, surface_ha, production_cycle,
            amount_requested, credit_purpose, duration_months, desired_schedule,
            savings_amount, guarantee_type, group_guarantee, other_guarantees,
            agent_note, created_offline)
            VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id, req.tenantId, data.local_id || null, req.user.id,
        data.applicant_name || null, data.applicant_phone || null, data.applicant_id_number || null,
        data.applicant_location || null, data.applicant_activity || null,
        data.sector || null, data.activity_type || null, data.years_experience || null,
        data.surface_ha || null, data.production_cycle || null,
        data.amount_requested || null, data.credit_purpose || null,
        data.duration_months || null, data.desired_schedule || null,
        data.savings_amount || null, data.guarantee_type || null,
        data.group_guarantee || null, data.other_guarantees || null,
        data.agent_note || null, data.created_offline ? 1 : 0,
      ],
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'DOSSIER_CREATED', 'dossier', id, { applicant: data.applicant_name }, req);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.put('/:id', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = await db.execute({
      sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [id, req.tenantId],
    });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Dossier introuvable' });

    if (req.user.role === 'AGENT' && existing.rows[0].agent_id !== req.user.id) {
      return res.status(403).json({ error: 'Ce dossier ne vous appartient pas' });
    }

    const fields = [
      'applicant_name', 'applicant_phone', 'applicant_id_number', 'applicant_location', 'applicant_activity',
      'sector', 'activity_type', 'years_experience', 'surface_ha', 'production_cycle',
      'amount_requested', 'credit_purpose', 'duration_months', 'desired_schedule',
      'savings_amount', 'guarantee_type', 'group_guarantee', 'other_guarantees', 'agent_note',
    ];

    const updates = [];
    const args = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        args.push(req.body[f]);
      }
    }

    if (updates.length === 0) return res.json({ ok: true, id });

    updates.push("updated_at = datetime('now')");
    args.push(id, req.tenantId);

    await db.execute({
      sql: `UPDATE dossiers SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
      args,
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'DOSSIER_UPDATED', 'dossier', id, { fields: Object.keys(req.body) }, req);
    res.json({ ok: true, id });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id/status', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { status } = req.body;

    const validTransitions = {
      draft: ['submitted'],
      submitted: ['verification', 'draft'],
      verification: ['review', 'submitted'],
      review: ['committee', 'verification'],
      committee: ['decided', 'review'],
      decided: ['exported', 'committee'],
      exported: ['disbursed'],
      disbursed: ['monitoring'],
      monitoring: ['closed'],
    };

    const existing = await db.execute({
      sql: 'SELECT status FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [id, req.tenantId],
    });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Dossier introuvable' });

    const current = existing.rows[0].status;
    const allowed = validTransitions[current] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Transition ${current} → ${status} non autorisée` });
    }

    await db.execute({
      sql: "UPDATE dossiers SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
      args: [status, id, req.tenantId],
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'STATUS_CHANGED', 'dossier', id, { from: current, to: status }, req);
    res.json({ ok: true, id, status });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/decide', authMiddleware, tenantGuard, requireRole('COMITE', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { decision, amount, duration, schedule, motif } = req.body;

    if (!decision || !motif) {
      return res.status(400).json({ error: 'Décision et motif requis' });
    }

    const existing = await db.execute({
      sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [id, req.tenantId],
    });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Dossier introuvable' });

    const dossier = existing.rows[0];
    const isOverride = dossier.prequalification &&
      ((decision === 'approved' && dossier.prequalification === 'NON_ELIGIBLE') ||
       (decision === 'refused' && dossier.prequalification === 'PREQUALIFIE') ||
       (amount && amount !== dossier.amount_requested));

    await db.execute({
      sql: `UPDATE dossiers SET
            decision = ?, decision_amount = ?, decision_duration = ?,
            decision_schedule = ?, decision_motif = ?,
            decided_by = ?, decided_at = datetime('now'),
            status = 'decided', updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?`,
      args: [decision, amount || null, duration || null, schedule || null, motif, req.user.id, id, req.tenantId],
    });

    const auditAction = isOverride ? 'DECISION_OVERRIDE' : 'DECISION_MADE';
    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, auditAction, 'dossier', id, {
      decision, amount, duration, motif,
      prequalification: dossier.prequalification,
      override: isOverride,
    }, req);

    res.json({ ok: true, id, decision, override: isOverride });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
