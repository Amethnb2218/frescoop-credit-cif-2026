import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.get('/', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM credit_products WHERE tenant_id = ? ORDER BY code',
      args: [req.tenantId],
    });
    res.json({ ok: true, products: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM credit_products WHERE id = ? AND tenant_id = ?',
      args: [req.params.id, req.tenantId],
    });
    if (!result.rows[0]) return res.status(404).json({ error: 'Produit introuvable' });
    res.json({ ok: true, product: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authMiddleware, tenantGuard, requireRole('ADMIN', 'SUPERADMIN', 'RISK_MANAGER'), async (req, res) => {
  try {
    const db = getDb();
    const { code, name, min_amount, max_amount, min_duration, max_duration, max_rate, eligible_sectors } = req.body;
    if (!code || !name) return res.status(400).json({ error: 'Code et nom requis' });

    const id = uuid();
    await db.execute({
      sql: `INSERT INTO credit_products (id, tenant_id, code, name, min_amount, max_amount, min_duration, max_duration, max_rate, eligible_sectors)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, req.tenantId, code, name, min_amount || 0, max_amount || null, min_duration || 1, max_duration || null, max_rate || null, JSON.stringify(eligible_sectors || [])],
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'PRODUCT_CREATED', 'credit_product', id, { code, name }, req);
    res.json({ ok: true, id });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.put('/:id', authMiddleware, tenantGuard, requireRole('ADMIN', 'SUPERADMIN', 'RISK_MANAGER'), async (req, res) => {
  try {
    const db = getDb();
    const { name, min_amount, max_amount, min_duration, max_duration, max_rate, eligible_sectors, active } = req.body;

    const fields = [];
    const args = [];
    if (name !== undefined) { fields.push('name = ?'); args.push(name); }
    if (min_amount !== undefined) { fields.push('min_amount = ?'); args.push(min_amount); }
    if (max_amount !== undefined) { fields.push('max_amount = ?'); args.push(max_amount); }
    if (min_duration !== undefined) { fields.push('min_duration = ?'); args.push(min_duration); }
    if (max_duration !== undefined) { fields.push('max_duration = ?'); args.push(max_duration); }
    if (max_rate !== undefined) { fields.push('max_rate = ?'); args.push(max_rate); }
    if (eligible_sectors !== undefined) { fields.push('eligible_sectors = ?'); args.push(JSON.stringify(eligible_sectors)); }
    if (active !== undefined) { fields.push('active = ?'); args.push(active ? 1 : 0); }

    if (fields.length === 0) return res.json({ ok: true });

    fields.push("updated_at = CURRENT_TIMESTAMP");
    args.push(req.params.id, req.tenantId);

    await db.execute({
      sql: `UPDATE credit_products SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
      args,
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'PRODUCT_UPDATED', 'credit_product', req.params.id, { fields: Object.keys(req.body) }, req);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
