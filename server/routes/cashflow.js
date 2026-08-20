import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.get('/dossier/:dossierId', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute({
      sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ? ORDER BY year, month',
      args: [req.params.dossierId, req.tenantId],
    });
    res.json({ ok: true, entries: result.rows });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/dossier/:dossierId', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const { dossierId } = req.params;
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Entrées de cash-flow requises' });
    }

    await db.execute({
      sql: 'DELETE FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });

    for (const entry of entries) {
      await db.execute({
        sql: `INSERT INTO cashflow_entries (id, dossier_id, tenant_id, month, year, revenue, revenue_detail, expenses, expenses_detail, debt_payments)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          uuid(), dossierId, req.tenantId,
          entry.month, entry.year || 2026,
          entry.revenue || 0, JSON.stringify(entry.revenue_detail || {}),
          entry.expenses || 0, JSON.stringify(entry.expenses_detail || {}),
          entry.debt_payments || 0,
        ],
      });
    }

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'CASHFLOW_UPDATED', 'dossier', dossierId, { months: entries.length }, req);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/dossier/:dossierId/stress-test', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { dossierId } = req.params;

    const cashflow = await db.execute({
      sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ? ORDER BY year, month',
      args: [dossierId, req.tenantId],
    });

    const dossier = await db.execute({
      sql: 'SELECT amount_requested, duration_months FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });

    if (!dossier.rows[0]) return res.status(404).json({ error: 'Dossier introuvable' });

    const entries = cashflow.rows;
    const { amount_requested, duration_months } = dossier.rows[0];
    const monthlyPayment = amount_requested && duration_months ? Math.ceil(amount_requested / duration_months) : 0;

    const totalRevenue = entries.reduce((s, e) => s + (e.revenue || 0), 0);
    const totalExpenses = entries.reduce((s, e) => s + (e.expenses || 0) + (e.debt_payments || 0), 0);

    const scenarios = [
      { scenario: 'normal', revenue_adjustment: 1.0, description: 'Scénario normal' },
      { scenario: 'stress_10', revenue_adjustment: 0.9, description: 'Baisse de 10% des revenus' },
      { scenario: 'stress_20', revenue_adjustment: 0.8, description: 'Baisse de 20% des revenus' },
      { scenario: 'delay', revenue_adjustment: 0.7, description: 'Retard de récolte (revenus décalés -30%)' },
      { scenario: 'price_drop', revenue_adjustment: 0.75, description: 'Chute du prix de vente (-25%)' },
    ];

    await db.execute({
      sql: 'DELETE FROM stress_tests WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });

    const results = [];
    for (const s of scenarios) {
      const adjustedRevenue = Math.floor(totalRevenue * s.revenue_adjustment);
      const netAvailable = adjustedRevenue - totalExpenses;
      const monthlyCapacity = duration_months ? Math.floor(netAvailable / duration_months) : 0;
      const canRepay = monthlyCapacity >= monthlyPayment;
      const margin = monthlyPayment > 0 ? ((monthlyCapacity - monthlyPayment) / monthlyPayment * 100) : 0;

      let recommendation = '';
      if (canRepay && margin > 20) recommendation = 'Capacité suffisante';
      else if (canRepay && margin > 0) recommendation = 'Capacité limite — calendrier saisonnier recommandé';
      else recommendation = 'Capacité insuffisante — montant ou durée à ajuster';

      const id = uuid();
      await db.execute({
        sql: `INSERT INTO stress_tests (id, dossier_id, tenant_id, scenario, revenue_adjustment, description, can_repay, monthly_capacity, margin_percent, recommendation)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [id, dossierId, req.tenantId, s.scenario, s.revenue_adjustment, s.description, canRepay ? 1 : 0, monthlyCapacity, Math.round(margin * 100) / 100, recommendation],
      });

      results.push({ id, ...s, can_repay: canRepay, monthly_capacity: monthlyCapacity, margin_percent: Math.round(margin * 100) / 100, recommendation });
    }

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'STRESS_TEST_RUN', 'dossier', dossierId, { scenarios: results.length }, req);
    res.json({ ok: true, stress_tests: results, monthly_payment: monthlyPayment });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
