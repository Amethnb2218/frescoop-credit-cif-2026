import { Router } from 'express';
import { getDb } from '../db.js';
import { authMiddleware, tenantGuard } from '../auth.js';
import { logAudit } from './audit.js';

const router = Router();

router.get('/memo/:dossierId/json', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { dossierId } = req.params;

    const memo = await buildMemo(db, dossierId, req.tenantId);
    if (!memo) return res.status(404).json({ error: 'Dossier introuvable' });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'EXPORT_MEMO_JSON', 'dossier', dossierId, {}, req);
    res.json({ ok: true, memo });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.get('/memo/:dossierId/csv', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { dossierId } = req.params;

    const memo = await buildMemo(db, dossierId, req.tenantId);
    if (!memo) return res.status(404).json({ error: 'Dossier introuvable' });

    const lines = [
      'Section,Champ,Valeur',
      `Identité,Nom,${esc(memo.identity.name)}`,
      `Identité,Téléphone,${esc(memo.identity.phone)}`,
      `Identité,N° ID,${esc(memo.identity.id_number)}`,
      `Identité,Localisation,${esc(memo.identity.location)}`,
      `Demande,Montant demandé,${memo.request.amount || ''}`,
      `Demande,Objet,${esc(memo.request.purpose)}`,
      `Demande,Durée (mois),${memo.request.duration_months || ''}`,
      `Demande,Calendrier,${esc(memo.request.schedule)}`,
      `Activité,Filière,${esc(memo.activity.sector)}`,
      `Activité,Type,${esc(memo.activity.type)}`,
      `Activité,Expérience (ans),${memo.activity.experience_years || ''}`,
      `Activité,Superficie (ha),${memo.activity.surface_ha || ''}`,
      `Cash-flow,Revenus annuels,${memo.cashflow_summary.total_revenue}`,
      `Cash-flow,Charges annuelles,${memo.cashflow_summary.total_expenses}`,
      `Cash-flow,Dettes annuelles,${memo.cashflow_summary.total_debt}`,
      `Cash-flow,Flux net,${memo.cashflow_summary.net_flow}`,
      `Cash-flow,Échéance mensuelle,${memo.cashflow_summary.monthly_payment}`,
      `Évaluation,Confiance preuves,${esc(memo.prequalification.evidence_confidence)}`,
      `Évaluation,Capacité remboursement,${esc(memo.prequalification.repayment_capacity)}`,
      `Évaluation,Préqualification,${esc(memo.prequalification.result)}`,
      `BIC,Crédits trouvés,${memo.bic.records_found}`,
      `BIC,Encours total,${memo.bic.total_outstanding}`,
      `BIC,Retards,${memo.bic.has_late_payments ? 'Oui' : 'Non'}`,
      `Garanties,Épargne,${memo.guarantees.savings || ''}`,
      `Garanties,Type,${esc(memo.guarantees.type)}`,
    ];

    if (memo.decision) {
      lines.push(`Décision,Résultat,${esc(memo.decision.result)}`);
      lines.push(`Décision,Montant accordé,${memo.decision.amount || ''}`);
      lines.push(`Décision,Motif,${esc(memo.decision.motif)}`);
    }

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'EXPORT_MEMO_CSV', 'dossier', dossierId, {}, req);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="frescoop-memo-${dossierId.slice(0, 8)}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

function esc(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function buildMemo(db, dossierId, tenantId) {
  const dossierResult = await db.execute({ sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?', args: [dossierId, tenantId] });
  if (!dossierResult.rows[0]) return null;
  const dossier = dossierResult.rows[0];

  const evidenceResult = await db.execute({ sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] });
  const cashflowResult = await db.execute({ sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] });
  const bicResult = await db.execute({ sql: 'SELECT * FROM bic_records WHERE tenant_id = ? AND applicant_id_number = ?', args: [tenantId, dossier.applicant_id_number || ''] });
  const stressResult = await db.execute({ sql: 'SELECT * FROM stress_tests WHERE dossier_id = ? AND tenant_id = ? ORDER BY computed_at DESC LIMIT 5', args: [dossierId, tenantId] });
  const flagsResult = await db.execute({ sql: 'SELECT * FROM risk_flags WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] });

  const evidence = evidenceResult.rows;
  const cashflow = cashflowResult.rows;
  const bicRecords = bicResult.rows;

  const totalRevenue = cashflow.reduce((s, e) => s + (e.revenue || 0), 0);
  const totalExpenses = cashflow.reduce((s, e) => s + (e.expenses || 0), 0);
  const totalDebt = cashflow.reduce((s, e) => s + (e.debt_payments || 0), 0);
  const monthlyPayment = dossier.amount_requested && dossier.duration_months ? Math.ceil(dossier.amount_requested / dossier.duration_months) : 0;

  return {
    generated_at: new Date().toISOString(),
    is_demo: true,
    identity: { name: dossier.applicant_name, phone: dossier.applicant_phone, id_number: dossier.applicant_id_number, location: dossier.applicant_location },
    request: { amount: dossier.amount_requested, purpose: dossier.credit_purpose, duration_months: dossier.duration_months, schedule: dossier.desired_schedule },
    activity: { sector: dossier.sector, type: dossier.activity_type, experience_years: dossier.years_experience, surface_ha: dossier.surface_ha },
    cashflow_summary: { total_revenue: totalRevenue, total_expenses: totalExpenses, total_debt: totalDebt, net_flow: totalRevenue - totalExpenses - totalDebt, monthly_payment: monthlyPayment },
    evidence_summary: { total: evidence.length, by_level: { A: evidence.filter(e => e.verification_level === 'A').length, B: evidence.filter(e => e.verification_level === 'B').length, C: evidence.filter(e => e.verification_level === 'C').length, D: evidence.filter(e => e.verification_level === 'D').length } },
    bic: { records_found: bicRecords.length, total_outstanding: bicRecords.reduce((s, r) => s + (r.outstanding || 0), 0), has_late_payments: bicRecords.some(r => r.days_late > 30) },
    stress_tests: stressResult.rows.map(s => ({ scenario: s.description, can_repay: !!s.can_repay, margin_percent: s.margin_percent })),
    risk_flags: flagsResult.rows.map(f => ({ code: f.code, label: f.label, severity: f.severity })),
    prequalification: { result: dossier.prequalification, evidence_confidence: dossier.evidence_confidence, repayment_capacity: dossier.repayment_capacity, reasons: JSON.parse(dossier.prequalification_reasons || '[]') },
    guarantees: { savings: dossier.savings_amount, type: dossier.guarantee_type },
    decision: dossier.decision ? { result: dossier.decision, amount: dossier.decision_amount, motif: dossier.decision_motif } : null,
  };
}

export default router;
