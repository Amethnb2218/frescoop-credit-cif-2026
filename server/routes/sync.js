import { Router } from 'express';
import { createHash } from 'crypto';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';
import { normalizeGuarantors, validateDossierFields, validateGuarantors } from './dossiers.js';
import { assessAgriculturalProject } from '../services/agriculturalAssessment.js';
import { assessAgriculturalFeasibility } from '../services/agriculturalFeasibility.js';
import {
  agriculturalAssessmentStatement,
  agriculturalFeasibilityRecord,
} from '../services/agriculturalFeasibilityPersistence.js';
import { buildFinancialCashflow } from '../services/financialCashflow.js';
import { evaluateDossier } from '../services/prequalification.js';

const router = Router();
const VALID_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const MAX_DOSSIER_ATTACHMENTS_SIZE = 10 * 1024 * 1024;

router.post('/push', authMiddleware, tenantGuard, requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
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
        sql: 'SELECT id, status FROM sync_queue WHERE entity_id = ? AND local_timestamp = ? AND tenant_id = ?',
        args: [entity_id, local_timestamp, req.tenantId],
      });

      if (existing.rows.some(item => item.status === 'synced')) {
        results.push({ entity_id, local_timestamp, status: 'duplicate', message: 'Opération déjà traitée' });
        continue;
      }
      if (existing.rows.length > 0) {
        await db.execute({
          sql: "DELETE FROM sync_queue WHERE entity_id = ? AND local_timestamp = ? AND tenant_id = ? AND status = 'failed'",
          args: [entity_id, local_timestamp, req.tenantId],
        });
      }

      try {
        if (entity_type === 'dossier') {
          await processDossierOp(db, operation, entity_id, payload, req);
        } else if (entity_type === 'evidence') {
          await processEvidenceOp(db, operation, entity_id, payload, req);
        } else if (entity_type === 'cashflow') {
          await processCashflowOp(db, operation, entity_id, payload, req);
        } else {
          throw new Error(`Type d'entité non pris en charge: ${entity_type}`);
        }

        await db.execute({
          sql: `INSERT INTO sync_queue (id, tenant_id, user_id, operation, entity_type, entity_id, payload, local_timestamp, status, server_timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', datetime('now'))`,
          args: [uuid(), req.tenantId, req.user.id, operation, entity_type, entity_id, JSON.stringify(payload), local_timestamp],
        });

        results.push({ entity_id, local_timestamp, status: 'synced' });
      } catch (err) {
        await db.execute({
          sql: `INSERT INTO sync_queue (id, tenant_id, user_id, operation, entity_type, entity_id, payload, local_timestamp, status, error)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'failed', ?)`,
          args: [uuid(), req.tenantId, req.user.id, operation, entity_type, entity_id, JSON.stringify(payload), local_timestamp, err.message],
        });
        results.push({ entity_id, local_timestamp, status: 'failed', error: err.message });
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
    const validationError = validateDossierFields(payload);
    if (validationError) throw new Error(validationError);
    const guarantors = normalizeGuarantors(payload);
    const guarantorError = validateGuarantors(payload, guarantors);
    if (guarantorError) throw new Error(guarantorError);
    const existing = await db.execute({
      sql: 'SELECT agent_id FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [entityId, req.tenantId],
    });
    if (existing.rows[0]) {
      if (req.user.role === 'AGENT' && existing.rows[0].agent_id !== req.user.id) {
        throw new Error('Dossier non autorisé');
      }
      return;
    }
    await db.execute({
      sql: `INSERT INTO dossiers (id, tenant_id, local_id, agent_id, status,
            applicant_name, applicant_phone, applicant_id_number, applicant_location, applicant_activity,
            sector, activity_type, years_experience, surface_ha, production_cycle,
            amount_requested, credit_purpose, duration_months, desired_schedule,
            savings_amount, guarantee_type, group_guarantee, other_guarantees, agent_note, created_offline)
            VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [entityId, req.tenantId, payload.local_id || null, req.user.id,
        payload.applicant_name || null, payload.applicant_phone || null,
        String(payload.applicant_id_number || '').trim().toUpperCase(), payload.applicant_location || null,
        payload.applicant_activity || null, payload.sector, payload.activity_type || null,
        payload.years_experience || null, payload.surface_ha || null, payload.production_cycle || null,
        payload.amount_requested || null, payload.credit_purpose || null, payload.duration_months || null,
        payload.desired_schedule || null, payload.savings_amount || null, payload.guarantee_type || null,
        payload.group_guarantee || null, payload.other_guarantees || null, payload.agent_note || null],
    });
    try {
      await syncDossierChildren(db, entityId, payload, guarantors, req);
      await evaluateDossier(db, req.tenantId, entityId);
    } catch (error) {
      await cleanupOfflineDossier(db, entityId, req.tenantId);
      throw error;
    }
    return;
  }
  if (operation === 'update') {
    const dossier = await ownedDossier(db, entityId, req);
    if (!dossier) throw new Error('Dossier introuvable ou non autorisé');
    const validationError = validateDossierFields(payload, true);
    if (validationError) throw new Error(validationError);
    const fields = [
      'applicant_name', 'applicant_phone', 'applicant_location', 'applicant_activity',
      'activity_type', 'years_experience', 'surface_ha', 'production_cycle',
      'amount_requested', 'credit_purpose', 'duration_months', 'desired_schedule',
      'savings_amount', 'guarantee_type', 'group_guarantee', 'other_guarantees', 'agent_note',
    ];
    const updates = [];
    const args = [];
    for (const field of fields) {
      if (payload[field] !== undefined) {
        updates.push(`${field} = ?`);
        args.push(payload[field]);
      }
    }
    if (updates.length) {
      args.push(entityId, req.tenantId);
      await db.execute({
        sql: `UPDATE dossiers SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
        args,
      });
    }
    const derivedInputsChanged = payload.project_assessment !== undefined
      || payload.input_items !== undefined
      || payload.financial_summary !== undefined
      || payload.declared_debts !== undefined
      || payload.applicant_location !== undefined
      || payload.amount_requested !== undefined;
    if (derivedInputsChanged) {
      await replaceDossierChildren(db, entityId, payload, req);
    }
    await evaluateDossier(db, req.tenantId, entityId);
    return;
  }
  throw new Error(`Opération dossier non prise en charge: ${operation}`);
}

async function cleanupOfflineDossier(db, dossierId, tenantId) {
  for (const table of ['cashflow_entries', 'dossier_guarantors', 'evidence', 'declared_debts',
    'agricultural_input_items', 'agricultural_project_assessments']) {
    await db.execute({ sql: `DELETE FROM ${table} WHERE dossier_id = ? AND tenant_id = ?`, args: [dossierId, tenantId] });
  }
  await db.execute({ sql: 'DELETE FROM dossiers WHERE id = ? AND tenant_id = ? AND created_offline = 1', args: [dossierId, tenantId] });
}

async function replaceDossierChildren(db, dossierId, payload, req) {
  const [dossierResult, projectResult, inputsResult, debtsResult, cashflowResult, evidenceResult] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?', args: [dossierId, req.tenantId] }),
    db.execute({ sql: 'SELECT * FROM agricultural_project_assessments WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, req.tenantId] }),
    db.execute({ sql: 'SELECT * FROM agricultural_input_items WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at', args: [dossierId, req.tenantId] }),
    db.execute({ sql: 'SELECT * FROM declared_debts WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, req.tenantId] }),
    db.execute({ sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ? ORDER BY year, month', args: [dossierId, req.tenantId] }),
    db.execute({ sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, req.tenantId] }),
  ]);
  const dossier = dossierResult.rows[0] || {};
  const currentProject = projectResult.rows[0] || {};
  const project = {
    ...currentProject,
    ...(payload.project_assessment || {}),
    amount_requested: payload.amount_requested ?? dossier.amount_requested,
  };
  const inputItems = Array.isArray(payload.input_items) ? payload.input_items : inputsResult.rows;
  const debts = Array.isArray(payload.declared_debts) ? payload.declared_debts : debtsResult.rows;
  const assessment = assessAgriculturalProject(project, inputItems, evidenceResult.rows);
  const analysis = await assessAgriculturalFeasibility({
    project,
    input_items: inputItems,
    evidence: evidenceResult.rows,
    context: { city: payload.applicant_location ?? dossier.applicant_location },
  });
  const feasibility = agriculturalFeasibilityRecord(analysis);

  await db.execute({
    sql: 'DELETE FROM agricultural_project_assessments WHERE dossier_id = ? AND tenant_id = ?',
    args: [dossierId, req.tenantId],
  });
  if (payload.project_assessment || projectResult.rows[0]) {
    await db.execute(agriculturalAssessmentStatement({
      dossierId,
      tenantId: req.tenantId,
      project,
      local: assessment,
      analysis,
      feasibility,
      id: uuid(),
    }));
  }
  if (Array.isArray(payload.input_items)) {
    await db.execute({
      sql: 'DELETE FROM agricultural_input_items WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });
    for (const item of inputItems) {
      const quantity = number(item.quantity);
      const unitCost = number(item.unit_cost);
      await db.execute({
        sql: `INSERT INTO agricultural_input_items
              (id, dossier_id, tenant_id, category, label, quantity, unit, unit_cost, total_cost, supplier, evidence_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [item.id || uuid(), dossierId, req.tenantId, item.category || 'autre', item.label || 'Intrant',
          quantity, item.unit || null, unitCost, Math.round(quantity * unitCost), item.supplier || null,
          item.evidence_id || null],
      });
    }
  }
  if (Array.isArray(payload.declared_debts)) {
    await db.execute({
      sql: 'DELETE FROM declared_debts WHERE dossier_id = ? AND tenant_id = ?',
      args: [dossierId, req.tenantId],
    });
    for (const debt of debts) await insertDebt(db, dossierId, debt, req.tenantId);
  }

  const previousDetail = cashflowResult.rows
    .map(entry => {
      try { return JSON.parse(entry.revenue_detail || '{}'); } catch { return {}; }
    })
    .find(detail => detail.derived)?.financial_inputs || {};
  const suppliedFinancial = payload.financial_summary || {};
  const financial = {
    ...previousDetail,
    ...suppliedFinancial,
    commerce_revenue: payload.revenue_commerce ?? suppliedFinancial.commerce_revenue ?? previousDetail.commerce_revenue,
    commerce_revenue_frequency: payload.commerce_revenue_frequency ?? suppliedFinancial.commerce_revenue_frequency ?? previousDetail.commerce_revenue_frequency,
    other_revenue: payload.revenue_other ?? suppliedFinancial.other_revenue ?? previousDetail.other_revenue,
    other_revenue_frequency: payload.other_revenue_frequency ?? suppliedFinancial.other_revenue_frequency ?? previousDetail.other_revenue_frequency,
    agricultural_expenses: payload.expenses_agriculture ?? suppliedFinancial.agricultural_expenses ?? previousDetail.agricultural_expenses,
    household_expenses: payload.expenses_household ?? suppliedFinancial.household_expenses ?? previousDetail.household_expenses,
    other_expenses: payload.expenses_other ?? suppliedFinancial.other_expenses ?? previousDetail.other_expenses,
  };
  const entries = buildFinancialCashflow(financial, {
    ...project,
    expected_revenue: assessment.metrics.expected_revenue,
    declared_revenue: feasibility.declared_revenue,
    retained_revenue: feasibility.retained_revenue,
    revenue_adjustment: analysis.details?.metrics?.revenue_adjustment ?? null,
  }, debts, payload.cashflow_year);
  await replaceCashflow(db, dossierId, entries, req.tenantId);
}

async function syncDossierChildren(db, dossierId, payload, guarantors, req) {
  const project = { ...(payload.project_assessment || {}), amount_requested: payload.amount_requested };
  const inputItems = Array.isArray(payload.input_items) ? payload.input_items : [];
  const debts = Array.isArray(payload.declared_debts) ? payload.declared_debts : [];
  const evidence = Array.isArray(payload.initial_evidence) ? payload.initial_evidence : [];
  const assessment = assessAgriculturalProject(project, inputItems, evidence);
  const feasibilityAnalysis = await assessAgriculturalFeasibility({
    project,
    input_items: inputItems,
    evidence,
    context: { city: payload.applicant_location },
  });
  const feasibility = agriculturalFeasibilityRecord(feasibilityAnalysis);
  if (payload.project_assessment) {
    await db.execute(agriculturalAssessmentStatement({
      dossierId,
      tenantId: req.tenantId,
      project,
      local: assessment,
      analysis: feasibilityAnalysis,
      feasibility,
      id: uuid(),
    }));
  }
  for (const item of inputItems) {
    const quantity = number(item.quantity);
    const unitCost = number(item.unit_cost);
    await db.execute({
      sql: `INSERT INTO agricultural_input_items
            (id, dossier_id, tenant_id, category, label, quantity, unit, unit_cost, total_cost, supplier, evidence_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [item.id || uuid(), dossierId, req.tenantId, item.category || 'autre', item.label || 'Intrant',
        quantity, item.unit || null, unitCost, Math.round(quantity * unitCost), item.supplier || null,
        item.evidence_id || null],
    });
  }
  for (const debt of debts) await insertDebt(db, dossierId, debt, req.tenantId);
  for (const item of evidence) await insertEvidence(db, dossierId, item, req.tenantId);
  for (const guarantor of guarantors) {
    await db.execute({
      sql: `INSERT INTO dossier_guarantors
            (id, dossier_id, tenant_id, full_name, id_number, phone, location, relationship,
             commitment_type, commitment_amount, consent_given, consent_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      args: [uuid(), dossierId, req.tenantId, guarantor.full_name, guarantor.id_number, guarantor.phone,
        guarantor.location, guarantor.relationship, guarantor.commitment_type,
        guarantor.commitment_amount, new Date().toISOString()],
    });
  }
  const financial = {
    commerce_revenue: payload.revenue_commerce,
    commerce_revenue_frequency: payload.commerce_revenue_frequency || payload.revenue_frequency,
    other_revenue: payload.revenue_other,
    other_revenue_frequency: payload.other_revenue_frequency || payload.revenue_frequency,
    agricultural_expenses: payload.expenses_agriculture,
    household_expenses: payload.expenses_household,
    other_expenses: payload.expenses_other,
    ...(payload.financial_summary || {}),
  };
  const entries = buildFinancialCashflow(financial, {
    ...project,
    expected_revenue: assessment.metrics.expected_revenue,
    declared_revenue: feasibility.declared_revenue,
    retained_revenue: feasibility.retained_revenue,
    revenue_adjustment: feasibilityAnalysis.details?.metrics?.revenue_adjustment ?? null,
  }, debts, payload.cashflow_year);
  await replaceCashflow(db, dossierId, entries, req.tenantId);
}

async function insertDebt(db, dossierId, debt, tenantId) {
  await db.execute({
    sql: `INSERT INTO declared_debts
          (id, dossier_id, tenant_id, institution, credit_type, source, initial_amount, outstanding,
           periodic_payment, frequency, start_date, end_date, status, days_late, purpose, reference,
           evidence_id, consent_given, agent_comment)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [debt.id || uuid(), dossierId, tenantId, debt.institution || null, debt.credit_type || null,
      ['DECLAREE', 'INTERNE', 'BIC'].includes(debt.source) ? debt.source : 'DECLAREE',
      number(debt.initial_amount), number(debt.outstanding), number(debt.periodic_payment ?? debt.monthly_payment),
      debt.frequency || 'mensuel', debt.start_date || null, debt.end_date || null, debt.status || 'en_cours',
      number(debt.days_late), debt.purpose || null, debt.reference || null, debt.evidence_id || null,
      debt.consent_given ? 1 : 0, debt.agent_comment || null],
  });
}

async function insertEvidence(db, dossierId, item, tenantId) {
  const level = ['C', 'D'].includes(item.verification_level) ? item.verification_level : 'C';
  await db.execute({
    sql: `INSERT INTO evidence (id, dossier_id, tenant_id, category, label, value, amount, unit,
          source, source_detail, verification_level, status, evidence_date, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [item.id || uuid(), dossierId, tenantId, item.category || 'projet', item.label || 'Preuve',
      item.value || null, item.amount || null, item.unit || null, item.source || 'document',
      item.source_detail || null, level, item.status || 'active', item.evidence_date || null,
      JSON.stringify(item.metadata || {})],
  });
}

function number(value) {
  const parsed = Number(value === 'neant' ? 0 : value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function processEvidenceOp(db, operation, entityId, payload, req) {
  if (operation === 'create') {
    const dossier = await ownedDossier(db, payload.dossier_id, req);
    if (!dossier) throw new Error('Dossier introuvable ou non autorisé');
    if (!['draft', 'incomplete'].includes(dossier.status)) {
      throw new Error('La preuve ne peut être ajoutée que sur un brouillon');
    }
    const existing = await db.execute({
      sql: 'SELECT id FROM evidence WHERE id = ? AND tenant_id = ?',
      args: [entityId, req.tenantId],
    });
    if (!existing.rows[0]) await insertEvidence(db, payload.dossier_id, { ...payload, id: entityId }, req.tenantId);
    return;
  }
  if (operation === 'update') {
    const current = await ownedEvidence(db, entityId, req);
    if (!current) throw new Error('Preuve introuvable ou non autorisée');
    if (!['draft', 'incomplete'].includes(current.status)) throw new Error('La preuve ne peut être modifiée que sur un brouillon');
    const fields = ['category', 'label', 'value', 'amount', 'unit', 'source', 'source_detail', 'status', 'evidence_date'];
    const updates = [];
    const args = [];
    for (const field of fields) {
      if (payload[field] !== undefined) { updates.push(`${field} = ?`); args.push(payload[field]); }
    }
    if (updates.length) {
      args.push(entityId, req.tenantId);
      await db.execute({ sql: `UPDATE evidence SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`, args });
    }
    return;
  }
  if (operation === 'delete') {
    const current = await ownedEvidence(db, entityId, req);
    if (!current) throw new Error('Preuve introuvable ou non autorisée');
    if (!['draft', 'incomplete'].includes(current.status)) throw new Error('La preuve ne peut être supprimée que sur un brouillon');
    await db.batch([
      { sql: 'DELETE FROM evidence_attachments WHERE evidence_id = ? AND tenant_id = ?', args: [entityId, req.tenantId] },
      { sql: 'DELETE FROM evidence WHERE id = ? AND tenant_id = ?', args: [entityId, req.tenantId] },
    ], 'write');
    return;
  }
  if (operation === 'attachment') {
    await saveAttachment(db, entityId, payload, req);
    return;
  }
  throw new Error(`Opération preuve non prise en charge: ${operation}`);
}

async function ownedEvidence(db, evidenceId, req) {
  const result = await db.execute({
    sql: `SELECT e.id, d.agent_id, d.status FROM evidence e
          JOIN dossiers d ON d.id = e.dossier_id AND d.tenant_id = e.tenant_id
          WHERE e.id = ? AND e.tenant_id = ? ${req.user.role === 'AGENT' ? 'AND d.agent_id = ?' : ''}`,
    args: req.user.role === 'AGENT'
      ? [evidenceId, req.tenantId, req.user.id]
      : [evidenceId, req.tenantId],
  });
  return result.rows[0];
}

async function ownedDossier(db, dossierId, req) {
  const result = await db.execute({
    sql: `SELECT id, agent_id, status FROM dossiers WHERE id = ? AND tenant_id = ?
          ${req.user.role === 'AGENT' ? 'AND agent_id = ?' : ''}`,
    args: req.user.role === 'AGENT'
      ? [dossierId, req.tenantId, req.user.id]
      : [dossierId, req.tenantId],
  });
  return result.rows[0];
}

function decodeAttachment(payload) {
  const mimeType = String(payload.mime_type || '').toLowerCase();
  if (!VALID_MIME_TYPES.has(mimeType)) throw new Error('Type de fichier invalide. Utilisez PDF, JPEG ou PNG.');
  if (typeof payload.content_base64 !== 'string' || !payload.content_base64) throw new Error('Contenu du fichier requis.');
  const content = Buffer.from(payload.content_base64, 'base64');
  if (!content.length || content.length > MAX_ATTACHMENT_SIZE) throw new Error('Le fichier doit avoir une taille maximale de 2 Mo.');
  const isPdf = content.subarray(0, 5).toString() === '%PDF-';
  const isJpeg = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  const isPng = content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if ((mimeType === 'application/pdf' && !isPdf) || (mimeType === 'image/jpeg' && !isJpeg)
    || (mimeType === 'image/png' && !isPng)) throw new Error('Le contenu du fichier ne correspond pas au type déclaré.');
  return { mimeType, content };
}

async function saveAttachment(db, evidenceId, payload, req) {
  const evidenceResult = await db.execute({
    sql: `SELECT e.dossier_id, d.agent_id, d.status FROM evidence e
          JOIN dossiers d ON d.id = e.dossier_id AND d.tenant_id = e.tenant_id
          WHERE e.id = ? AND e.tenant_id = ?`,
    args: [evidenceId, req.tenantId],
  });
  const evidence = evidenceResult.rows[0];
  if (!evidence || (req.user.role === 'AGENT' && evidence.agent_id !== req.user.id)) {
    throw new Error('Preuve introuvable ou non autorisée');
  }
  if (!['draft', 'incomplete'].includes(evidence.status)) throw new Error('La pièce jointe ne peut être modifiée que sur un brouillon');
  const decoded = decodeAttachment(payload);
  const totals = await db.execute({
    sql: `SELECT COALESCE(SUM(size_bytes), 0) AS total FROM evidence_attachments
          WHERE dossier_id = ? AND tenant_id = ? AND evidence_id <> ?`,
    args: [evidence.dossier_id, req.tenantId, evidenceId],
  });
  if (Number(totals.rows[0].total) + decoded.content.length > MAX_DOSSIER_ATTACHMENTS_SIZE) {
    throw new Error('La taille totale des pièces jointes est limitée à 10 Mo par dossier.');
  }
  const sha256 = createHash('sha256').update(decoded.content).digest('hex');
  await db.execute({
    sql: `INSERT INTO evidence_attachments
          (id, evidence_id, dossier_id, tenant_id, original_name, mime_type, size_bytes, sha256, content, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, evidence_id) DO UPDATE SET original_name = excluded.original_name,
            mime_type = excluded.mime_type, size_bytes = excluded.size_bytes, sha256 = excluded.sha256,
            content = excluded.content, created_by = excluded.created_by, updated_at = datetime('now')`,
    args: [uuid(), evidenceId, evidence.dossier_id, req.tenantId,
      String(payload.original_name || 'piece-jointe').slice(0, 255), decoded.mimeType,
      decoded.content.length, sha256, decoded.content, req.user.id],
  });
  await db.execute({
    sql: 'UPDATE evidence SET metadata = ? WHERE id = ? AND tenant_id = ?',
    args: [JSON.stringify({ file_name: payload.original_name, file_type: decoded.mimeType,
      file_size: decoded.content.length, sha256, upload_pending: false }), evidenceId, req.tenantId],
  });
  await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role,
    'EVIDENCE_ATTACHMENT_SAVED', 'evidence', evidenceId, {
      dossier_id: evidence.dossier_id, mime_type: decoded.mimeType,
      size: decoded.content.length, sha256, synchronized: true,
    }, req);
}

async function processCashflowOp(db, operation, entityId, payload, req) {
  if (operation !== 'create' && operation !== 'update') {
    throw new Error(`Opération cash-flow non prise en charge: ${operation}`);
  }
  const dossier = await ownedDossier(db, entityId, req);
  if (!dossier) throw new Error('Dossier introuvable ou non autorisé');
  if (!['draft', 'incomplete'].includes(dossier.status)) {
    throw new Error('Le cash-flow ne peut être modifié que sur un brouillon');
  }
  await replaceCashflow(db, entityId, payload.entries || [], req.tenantId);
}

async function replaceCashflow(db, dossierId, entries, tenantId) {
  await db.execute({ sql: 'DELETE FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ?', args: [dossierId, tenantId] });
  for (const entry of entries) {
    await db.execute({
      sql: `INSERT INTO cashflow_entries
            (id, dossier_id, tenant_id, month, year, revenue, revenue_detail, expenses, expenses_detail, debt_payments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [uuid(), dossierId, tenantId, entry.month, entry.year || 2026, entry.revenue || 0,
        JSON.stringify(entry.revenue_detail || {}), entry.expenses || 0,
        JSON.stringify(entry.expenses_detail || {}), entry.debt_payments || 0],
    });
  }
}

export default router;
