import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.get('/check/:idNumber', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM bic_records WHERE tenant_id = ? AND applicant_id_number = ?',
      args: [req.tenantId, req.params.idNumber],
    });

    const records = result.rows;
    const totalOutstanding = records.reduce((s, r) => s + (r.outstanding || 0), 0);
    const totalMonthly = records.reduce((s, r) => s + (r.monthly_payment || 0), 0);
    const hasLate = records.some(r => r.days_late > 30);

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'BIC_CHECK', 'bic', req.params.idNumber, {
      records_found: records.length, total_outstanding: totalOutstanding,
    }, req);

    res.json({
      ok: true,
      is_demo: true,
      records,
      summary: {
        total_records: records.length,
        total_outstanding: totalOutstanding,
        total_monthly_payment: totalMonthly,
        has_late_payments: hasLate,
        max_days_late: records.reduce((max, r) => Math.max(max, r.days_late || 0), 0),
      },
    });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
