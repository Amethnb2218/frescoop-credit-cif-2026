import { Router } from 'express';
import { getDb, uuid } from '../db.js';
import { authMiddleware, tenantGuard, requireRole } from '../auth.js';
import { logAudit } from './audit.js';
import { assessAgriculturalProject } from '../services/agriculturalAssessment.js';
import { assessAgriculturalFeasibility } from '../services/agriculturalFeasibility.js';
import {
  agriculturalAssessmentStatement,
  agriculturalFeasibilityRecord,
} from '../services/agriculturalFeasibilityPersistence.js';
import { buildFinancialCashflow } from '../services/financialCashflow.js';
import { evaluateDossier } from '../services/prequalification.js';
import { findAccessibleDossier, isEditableDraft, scoreInvalidationStatement } from '../services/dossierAccess.js';

const router = Router();
const ALLOWED_ACTIVITY_TYPES = new Set([
  'Grandes cultures',
  'Maraîchage',
  'Céréales (mil, sorgho, maïs)',
  'Arachide',
  'Horticulture',
]);
const THIRD_PARTY_GUARANTEES = new Set(['Caution personnelle', 'Mixte']);

export const VALID_STATUS_TRANSITIONS = Object.freeze({
  draft: ['incomplete', 'submitted', 'cancelled'],
  incomplete: ['draft', 'submitted', 'cancelled'],
  submitted: ['verification', 'draft', 'cancelled'],
  verification: ['review', 'review_required', 'prequalified', 'submitted', 'cancelled'],
  review: ['review_required', 'prequalified', 'committee_ready', 'committee', 'verification', 'cancelled'],
  review_required: ['verification', 'prequalified', 'committee_ready', 'committee', 'cancelled'],
  prequalified: ['committee_ready', 'committee', 'review', 'cancelled'],
  committee_ready: ['review', 'cancelled'],
  committee: ['review', 'cancelled'],
  decided: ['exported', 'cancelled'],
  exported: ['disbursed'],
  disbursed: ['monitoring'],
  monitoring: ['closed'],
  closed: [],
  cancelled: [],
});

const AGENT_STATUS_TRANSITIONS = Object.freeze({
  draft: ['incomplete', 'submitted', 'cancelled'],
  incomplete: ['draft', 'submitted', 'cancelled'],
});

const REVIEW_STATUS_SOURCES = new Set([
  'draft', 'incomplete', 'submitted', 'verification', 'review',
  'review_required', 'prequalified', 'committee_ready', 'committee',
]);

export function canTransitionDossierStatus(role, current, target, ownsDossier = false) {
  if (!(VALID_STATUS_TRANSITIONS[current] || []).includes(target) || target === 'decided') return false;
  if (role === 'AGENT') {
    return ownsDossier && (AGENT_STATUS_TRANSITIONS[current] || []).includes(target);
  }
  if (['SUPERVISEUR', 'RISK_MANAGER'].includes(role)) {
    return REVIEW_STATUS_SOURCES.has(current);
  }
  return ['ADMIN', 'SUPERADMIN'].includes(role);
}

function normalizeIdNumber(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function validateDossierFields(data, partial = false) {
  if (!partial || data.applicant_id_number !== undefined) {
    const idNumber = normalizeIdNumber(data.applicant_id_number);
    if (!/^[A-Z0-9][A-Z0-9 -]{4,29}$/.test(idNumber)) {
      return 'Le numéro de CNI est obligatoire et doit contenir entre 5 et 30 caractères alphanumériques.';
    }
  }
  if (!partial || data.sector !== undefined) {
    if (data.sector !== 'Agriculture') return 'Le secteur doit être Agriculture pour un nouveau dossier.';
  }
  if (data.activity_type !== undefined && data.activity_type && !ALLOWED_ACTIVITY_TYPES.has(data.activity_type)) {
    return 'Type d’activité agricole invalide.';
  }
  return null;
}

export function normalizeGuarantors(data) {
  const singleGuarantor = data.third_party_guarantor;
  const supplied = Array.isArray(data.guarantors)
    ? data.guarantors
    : (singleGuarantor ? [singleGuarantor] : (data.third_party_commitment ? [{
        full_name: data.guarantor_name,
        id_number: data.guarantor_id_number,
        phone: data.guarantor_phone,
        location: data.guarantor_location,
        relationship: data.guarantor_relationship,
        commitment_type: data.guarantor_commitment_type,
        commitment_amount: data.guarantor_commitment_amount,
        consent_given: data.guarantor_consent,
      }] : []));
  return supplied.map(guarantor => ({
    full_name: String(guarantor.full_name || guarantor.name || '').trim(),
    id_number: normalizeIdNumber(guarantor.id_number || guarantor.cni),
    phone: String(guarantor.phone || '').trim(),
    location: String(guarantor.location || guarantor.address || '').trim(),
    relationship: String(guarantor.relationship || '').trim(),
    commitment_type: String(guarantor.commitment_type || guarantor.nature || '').trim(),
    commitment_amount: amount(guarantor.commitment_amount ?? guarantor.amount ?? guarantor.limit),
    consent_given: Boolean(guarantor.consent_given ?? guarantor.consent),
  }));
}

export function validateGuarantors(data, guarantors) {
  const required = data.third_party_commitment === true || Boolean(data.third_party_guarantor)
    || THIRD_PARTY_GUARANTEES.has(data.guarantee_type);
  if (!required && guarantors.length === 0) return null;
  if (guarantors.length === 0) return 'Les informations structurées du garant sont obligatoires pour un engagement de tiers.';
  for (const guarantor of guarantors) {
    if (!guarantor.full_name || !/^[A-Z0-9][A-Z0-9 -]{4,29}$/.test(guarantor.id_number)
      || !guarantor.phone || !guarantor.location || !guarantor.relationship
      || !guarantor.commitment_type || guarantor.commitment_amount <= 0
      || !guarantor.consent_given) {
      return 'Garant incomplet : nom, CNI, téléphone, adresse, lien, nature, montant et consentement sont obligatoires.';
    }
  }
  return null;
}

function amount(value) {
  if (value === 'neant' || value === '' || value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function json(value, fallback) {
  return JSON.stringify(value ?? fallback);
}


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

router.post('/agricultural-feasibility', authMiddleware, tenantGuard,
  requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
    try {
      const project = req.body?.project && typeof req.body.project === 'object'
        ? req.body.project : {};
      const inputItems = Array.isArray(req.body?.input_items) ? req.body.input_items : [];
      const context = req.body?.context && typeof req.body.context === 'object'
        ? req.body.context : {};
      const result = await assessAgriculturalFeasibility({ project, input_items: inputItems, context });
      res.json(result);
    } catch {
      res.status(500).json({ error: "L'analyse agronomique est temporairement indisponible." });
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
    if (!dossier || (req.user.role === 'AGENT' && dossier.agent_id !== req.user.id)) {
      return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });
    }

    const [evidence, cashflow, flags, stressTests, ruleEvals, project, inputItems, declaredDebts, guarantors] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at DESC', args: [req.params.id, req.tenantId] }),
      db.execute({ sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ? ORDER BY year, month', args: [req.params.id, req.tenantId] }),
      db.execute({ sql: 'SELECT * FROM risk_flags WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at DESC', args: [req.params.id, req.tenantId] }),
      db.execute({ sql: 'SELECT * FROM stress_tests WHERE dossier_id = ? AND tenant_id = ? ORDER BY computed_at DESC', args: [req.params.id, req.tenantId] }),
      db.execute({
        sql: `SELECT re.*, r.code, r.name, r.description FROM rule_evaluations re
              JOIN rules r ON re.rule_id = r.id AND r.tenant_id = re.tenant_id
              WHERE re.dossier_id = ? AND re.tenant_id = ? ORDER BY re.evaluated_at DESC`,
        args: [req.params.id, req.tenantId],
      }),
      db.execute({ sql: 'SELECT * FROM agricultural_project_assessments WHERE dossier_id = ? AND tenant_id = ?', args: [req.params.id, req.tenantId] }),
      db.execute({ sql: 'SELECT * FROM agricultural_input_items WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at', args: [req.params.id, req.tenantId] }),
      db.execute({ sql: 'SELECT * FROM declared_debts WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at', args: [req.params.id, req.tenantId] }),
      db.execute({ sql: 'SELECT * FROM dossier_guarantors WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at', args: [req.params.id, req.tenantId] }),
    ]);

    res.json({
      ok: true,
      dossier,
      evidence: evidence.rows,
      cashflow: cashflow.rows,
      risk_flags: flags.rows,
      stress_tests: stressTests.rows,
      rule_evaluations: ruleEvals.rows,
      project_assessment: project.rows[0] || null,
      input_items: inputItems.rows,
      declared_debts: declaredDebts.rows,
      guarantors: guarantors.rows,
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
    const validationError = validateDossierFields(data);
    if (validationError) return res.status(400).json({ error: validationError });
    data.applicant_id_number = normalizeIdNumber(data.applicant_id_number);

    const guarantors = normalizeGuarantors(data);
    const guarantorError = validateGuarantors(data, guarantors);
    if (guarantorError) return res.status(400).json({ error: guarantorError });

    if (data.id) {
      const duplicate = await db.execute({
        sql: 'SELECT tenant_id, agent_id FROM dossiers WHERE id = ?',
        args: [id],
      });
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].tenant_id === req.tenantId
          && (req.user.role !== 'AGENT' || duplicate.rows[0].agent_id === req.user.id)) {
          return res.json({ ok: true, id, idempotent: true });
        }
        return res.status(409).json({ error: 'Identifiant de dossier déjà utilisé.' });
      }
    }

    const projectData = { ...(data.project_assessment || {}), amount_requested: data.amount_requested };
    const inputItems = Array.isArray(data.input_items) ? data.input_items : [];
    const declaredDebts = Array.isArray(data.declared_debts) ? data.declared_debts : [];
    const initialEvidence = Array.isArray(data.initial_evidence) ? data.initial_evidence : [];
    const agriculturalResult = assessAgriculturalProject(projectData, inputItems, initialEvidence);
    const feasibilityAnalysis = await assessAgriculturalFeasibility({
      project: projectData,
      input_items: inputItems,
      evidence: initialEvidence,
      context: { city: data.applicant_location },
    });
    const feasibility = agriculturalFeasibilityRecord(feasibilityAnalysis);
    const statements = [{
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
    }];

    if (data.project_assessment) {
      statements.push(agriculturalAssessmentStatement({
        dossierId: id,
        tenantId: req.tenantId,
        project: projectData,
        local: agriculturalResult,
        analysis: feasibilityAnalysis,
        feasibility,
        id: uuid(),
      }));
    }

    for (const item of inputItems) {
      const quantity = amount(item.quantity);
      const unitCost = amount(item.unit_cost);
      statements.push({
        sql: `INSERT INTO agricultural_input_items
              (id, dossier_id, tenant_id, category, label, quantity, unit, unit_cost, total_cost, supplier, evidence_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [uuid(), id, req.tenantId, item.category || 'autre', item.label || 'Intrant', quantity,
          item.unit || null, unitCost, Math.round(quantity * unitCost), item.supplier || null, item.evidence_id || null],
      });
    }

    for (const debt of declaredDebts) {
      statements.push({
        sql: `INSERT INTO declared_debts
              (id, dossier_id, tenant_id, institution, credit_type, source, initial_amount,
               outstanding, periodic_payment, frequency, start_date, end_date, status,
               days_late, purpose, reference, evidence_id, consent_given, agent_comment)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [debt.id || uuid(), id, req.tenantId, debt.institution || null, debt.credit_type || null,
          ['DECLAREE', 'INTERNE', 'BIC'].includes(debt.source) ? debt.source : 'DECLAREE',
          amount(debt.initial_amount), amount(debt.outstanding), amount(debt.periodic_payment ?? debt.monthly_payment),
          debt.frequency || 'mensuel', debt.start_date || null, debt.end_date || null,
          debt.status || 'en_cours', amount(debt.days_late), debt.purpose || null,
          debt.reference || null, debt.evidence_id || null, debt.consent_given ? 1 : 0,
          debt.agent_comment || null],
      });
    }

    for (const item of initialEvidence) {
      const level = ['C', 'D'].includes(item.verification_level) ? item.verification_level : 'C';
      statements.push({
        sql: `INSERT INTO evidence (id, dossier_id, tenant_id, category, label, value, amount, unit,
              source, source_detail, verification_level, status, evidence_date, metadata)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [item.id || uuid(), id, req.tenantId, item.category || 'projet', item.label || 'Preuve',
          item.value || null, item.amount || null, item.unit || null, item.source || 'document',
          item.source_detail || null, level, item.status || 'active', item.evidence_date || null,
          json(item.metadata, {})],
      });
    }

    for (const guarantor of guarantors) {
      statements.push({
        sql: `INSERT INTO dossier_guarantors
              (id, dossier_id, tenant_id, full_name, id_number, phone, location, relationship,
               commitment_type, commitment_amount, consent_given, consent_date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [uuid(), id, req.tenantId, guarantor.full_name, guarantor.id_number, guarantor.phone,
          guarantor.location, guarantor.relationship, guarantor.commitment_type,
          guarantor.commitment_amount, 1, new Date().toISOString()],
      });
    }

    const projectForCashflow = {
      ...projectData,
      expected_revenue: agriculturalResult.metrics.expected_revenue,
      declared_revenue: feasibility.declared_revenue,
      retained_revenue: feasibility.retained_revenue,
      revenue_adjustment: feasibilityAnalysis.details?.metrics?.revenue_adjustment ?? null,
    };
    const legacyFinancial = {
      commerce_revenue: data.revenue_commerce,
      commerce_revenue_frequency: data.commerce_revenue_frequency || data.revenue_frequency,
      other_revenue: data.revenue_other,
      other_revenue_frequency: data.other_revenue_frequency || data.revenue_frequency,
      agricultural_expenses: data.expenses_agriculture,
      household_expenses: data.expenses_household,
      other_expenses: data.expenses_other,
      ...(data.financial_summary || {}),
    };
    const initialCashflow = buildFinancialCashflow(
      legacyFinancial,
      projectForCashflow,
      declaredDebts,
      data.cashflow_year,
    );
    for (const entry of initialCashflow) {
      statements.push({
        sql: `INSERT INTO cashflow_entries
              (id, dossier_id, tenant_id, month, year, revenue, revenue_detail, expenses, expenses_detail, debt_payments)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [uuid(), id, req.tenantId, entry.month, entry.year, entry.revenue,
          json(entry.revenue_detail, {}), entry.expenses, json(entry.expenses_detail, {}), entry.debt_payments],
      });
    }

    await db.batch(statements, 'write');
    const evaluation = await evaluateDossier(db, req.tenantId, id);

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'DOSSIER_CREATED', 'dossier', id, {
      applicant: data.applicant_name,
      feasibility_status: feasibility.feasibility_status,
      prequalification: evaluation?.prequalification || null,
      score: evaluation?.score ?? null,
    }, req);
    res.json({
      ok: true,
      id,
      feasibility: feasibilityAnalysis,
      prequalification: evaluation?.prequalification || null,
      score: evaluation?.score ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur', detail: err.message });
  }
});

router.put('/:id', authMiddleware, tenantGuard,
  requireRole('AGENT', 'SUPERVISEUR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const dossier = await findAccessibleDossier(db, id, req);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });
    if (!isEditableDraft(dossier)) {
      return res.status(409).json({ error: 'Le dossier ne peut être modifié que sur un brouillon' });
    }

    const data = req.body;
    const validationError = validateDossierFields(data, true);
    if (validationError) return res.status(400).json({ error: validationError });
    if (data.applicant_id_number !== undefined) data.applicant_id_number = normalizeIdNumber(data.applicant_id_number);
    const projectProvided = data.project_assessment !== undefined;
    const inputItemsProvided = data.input_items !== undefined;
    const debtsProvided = data.declared_debts !== undefined;
    if (debtsProvided && !Array.isArray(data.declared_debts)) {
      return res.status(400).json({ error: 'Les dettes déclarées doivent être une liste.' });
    }
    const financialProvided = data.financial_summary !== undefined || [
      'revenue_commerce', 'commerce_revenue_frequency', 'revenue_frequency', 'revenue_other',
      'other_revenue_frequency', 'expenses_agriculture', 'expenses_household', 'expenses_other',
      'cashflow_year',
    ].some(field => data[field] !== undefined);
    const guarantorsProvided = data.guarantors !== undefined || data.third_party_guarantor !== undefined
      || data.third_party_commitment !== undefined || Object.keys(data).some(key => key.startsWith('guarantor_'));
    const guarantors = guarantorsProvided ? normalizeGuarantors(data) : [];
    if (guarantorsProvided) {
      const guarantorError = validateGuarantors(data, guarantors);
      if (guarantorError) return res.status(400).json({ error: guarantorError });
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

    if (updates.length === 0 && !guarantorsProvided && !projectProvided
      && !inputItemsProvided && !financialProvided && !debtsProvided) return res.json({ ok: true, id });

    const statements = [];
    if (updates.length > 0) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      args.push(id, req.tenantId);
      statements.push({
        sql: `UPDATE dossiers SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
        args,
      });
    }
    if (guarantorsProvided) {
      statements.push({
        sql: 'DELETE FROM dossier_guarantors WHERE dossier_id = ? AND tenant_id = ?',
        args: [id, req.tenantId],
      });
      for (const guarantor of guarantors) {
        statements.push({
          sql: `INSERT INTO dossier_guarantors
                (id, dossier_id, tenant_id, full_name, id_number, phone, location, relationship,
                 commitment_type, commitment_amount, consent_given, consent_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [uuid(), id, req.tenantId, guarantor.full_name, guarantor.id_number, guarantor.phone,
            guarantor.location, guarantor.relationship, guarantor.commitment_type,
            guarantor.commitment_amount, 1, new Date().toISOString()],
        });
      }
    }
    let recalculatedProject = null;
    let recalculatedAnalysis = null;
    const agronomicInputsChanged = projectProvided || inputItemsProvided
      || data.applicant_location !== undefined || data.amount_requested !== undefined;
    const cashflowInputsChanged = agronomicInputsChanged || financialProvided || debtsProvided;
    if (agronomicInputsChanged) {
      const [projectResult, inputsResult, evidenceResult] = await Promise.all([
        db.execute({ sql: 'SELECT * FROM agricultural_project_assessments WHERE dossier_id = ? AND tenant_id = ?', args: [id, req.tenantId] }),
        db.execute({ sql: 'SELECT * FROM agricultural_input_items WHERE dossier_id = ? AND tenant_id = ? ORDER BY created_at', args: [id, req.tenantId] }),
        db.execute({ sql: 'SELECT * FROM evidence WHERE dossier_id = ? AND tenant_id = ?', args: [id, req.tenantId] }),
      ]);
      const currentProject = projectResult.rows[0] || {};
      const projectData = {
        ...currentProject,
        ...(projectProvided ? data.project_assessment : {}),
        amount_requested: data.amount_requested ?? dossier.amount_requested,
      };
      const inputItems = inputItemsProvided && Array.isArray(data.input_items)
        ? data.input_items
        : inputsResult.rows;
      const local = assessAgriculturalProject(projectData, inputItems, evidenceResult.rows);
      const analysis = await assessAgriculturalFeasibility({
        project: projectData,
        input_items: inputItems,
        evidence: evidenceResult.rows,
        context: { city: data.applicant_location ?? dossier.applicant_location },
      });
      recalculatedProject = projectData;
      recalculatedAnalysis = analysis;
      statements.push({
        sql: 'DELETE FROM agricultural_project_assessments WHERE dossier_id = ? AND tenant_id = ?',
        args: [id, req.tenantId],
      });
      if (projectProvided || projectResult.rows[0]) {
        statements.push(agriculturalAssessmentStatement({
          dossierId: id,
          tenantId: req.tenantId,
          project: projectData,
          local,
          analysis,
          id: uuid(),
        }));
      }
      if (inputItemsProvided) {
        statements.push({
          sql: 'DELETE FROM agricultural_input_items WHERE dossier_id = ? AND tenant_id = ?',
          args: [id, req.tenantId],
        });
        for (const item of inputItems) {
          const quantity = amount(item.quantity);
          const unitCost = amount(item.unit_cost);
          statements.push({
            sql: `INSERT INTO agricultural_input_items
                  (id, dossier_id, tenant_id, category, label, quantity, unit, unit_cost, total_cost, supplier, evidence_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [item.id || uuid(), id, req.tenantId, item.category || 'autre', item.label || 'Intrant',
              quantity, item.unit || null, unitCost, Math.round(quantity * unitCost), item.supplier || null,
              item.evidence_id || null],
          });
        }
      }
    }

    if (cashflowInputsChanged) {
      const [projectResult, debtsResult, cashflowResult] = await Promise.all([
        db.execute({ sql: 'SELECT * FROM agricultural_project_assessments WHERE dossier_id = ? AND tenant_id = ?', args: [id, req.tenantId] }),
        db.execute({ sql: 'SELECT * FROM declared_debts WHERE dossier_id = ? AND tenant_id = ?', args: [id, req.tenantId] }),
        db.execute({ sql: 'SELECT * FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ? ORDER BY year, month', args: [id, req.tenantId] }),
      ]);
      const project = recalculatedProject || projectResult.rows[0] || {};
      const analysis = recalculatedAnalysis;
      const metrics = analysis?.details?.metrics || {};
      const projectForCashflow = {
        ...project,
        declared_revenue: metrics.declared_revenue ?? project.declared_revenue,
        retained_revenue: metrics.retained_revenue ?? project.retained_revenue,
        revenue_adjustment: metrics.revenue_adjustment
          ?? (project.declared_revenue != null && project.retained_revenue != null
            ? Number(project.retained_revenue) - Number(project.declared_revenue)
            : null),
      };
      const previousDetail = cashflowResult.rows
        .map(entry => {
          try { return JSON.parse(entry.revenue_detail || '{}'); } catch { return {}; }
        })
        .find(detail => detail.derived)?.financial_inputs || {};
      const financial = {
        ...previousDetail,
        commerce_revenue: data.revenue_commerce ?? data.financial_summary?.commerce_revenue ?? previousDetail.commerce_revenue,
        commerce_revenue_frequency: data.commerce_revenue_frequency ?? data.financial_summary?.commerce_revenue_frequency ?? previousDetail.commerce_revenue_frequency,
        other_revenue: data.revenue_other ?? data.financial_summary?.other_revenue ?? previousDetail.other_revenue,
        other_revenue_frequency: data.other_revenue_frequency ?? data.financial_summary?.other_revenue_frequency ?? previousDetail.other_revenue_frequency,
        agricultural_expenses: data.expenses_agriculture ?? data.financial_summary?.agricultural_expenses ?? previousDetail.agricultural_expenses,
        household_expenses: data.expenses_household ?? data.financial_summary?.household_expenses ?? previousDetail.household_expenses,
        other_expenses: data.expenses_other ?? data.financial_summary?.other_expenses ?? previousDetail.other_expenses,
      };
      const debts = debtsProvided ? data.declared_debts : debtsResult.rows;
      const entries = buildFinancialCashflow(financial, projectForCashflow, debts, data.cashflow_year);
      if (debtsProvided) {
        statements.push({
          sql: 'DELETE FROM declared_debts WHERE dossier_id = ? AND tenant_id = ?',
          args: [id, req.tenantId],
        });
        for (const debt of debts) {
          statements.push({
            sql: `INSERT INTO declared_debts
                  (id, dossier_id, tenant_id, institution, credit_type, source, initial_amount,
                   outstanding, periodic_payment, frequency, start_date, end_date, status,
                   days_late, purpose, reference, evidence_id, consent_given, agent_comment)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [debt.id || uuid(), id, req.tenantId, debt.institution || null, debt.credit_type || null,
              ['DECLAREE', 'INTERNE', 'BIC'].includes(debt.source) ? debt.source : 'DECLAREE',
              amount(debt.initial_amount), amount(debt.outstanding), amount(debt.periodic_payment ?? debt.monthly_payment),
              debt.frequency || 'mensuel', debt.start_date || null, debt.end_date || null,
              debt.status || 'en_cours', amount(debt.days_late), debt.purpose || null,
              debt.reference || null, debt.evidence_id || null, debt.consent_given ? 1 : 0,
              debt.agent_comment || null],
          });
        }
      }
      statements.push({
        sql: 'DELETE FROM cashflow_entries WHERE dossier_id = ? AND tenant_id = ?',
        args: [id, req.tenantId],
      });
      for (const entry of entries) {
        statements.push({
          sql: `INSERT INTO cashflow_entries
                (id, dossier_id, tenant_id, month, year, revenue, revenue_detail, expenses, expenses_detail, debt_payments)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [uuid(), id, req.tenantId, entry.month, entry.year, entry.revenue,
            json(entry.revenue_detail, {}), entry.expenses, json(entry.expenses_detail, {}), entry.debt_payments],
        });
      }
    }

    statements.push(scoreInvalidationStatement(id, req.tenantId));
    await db.batch(statements, 'write');
    const evaluation = await evaluateDossier(db, req.tenantId, id);

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'DOSSIER_UPDATED', 'dossier', id, {
      fields: Object.keys(req.body),
      prequalification: evaluation?.prequalification || null,
      score: evaluation?.score ?? null,
    }, req);
    res.json({ ok: true, id, prequalification: evaluation?.prequalification || null, score: evaluation?.score ?? null });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id/status', authMiddleware, tenantGuard, async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { status } = req.body;

    const existing = await db.execute({
      sql: 'SELECT status, agent_id FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [id, req.tenantId],
    });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Dossier introuvable' });

    const current = existing.rows[0].status;
    const ownsDossier = existing.rows[0].agent_id === req.user.id;
    if (req.user.role === 'AGENT' && !ownsDossier) {
      return res.status(404).json({ error: 'Dossier introuvable ou non autorisé' });
    }
    if (!canTransitionDossierStatus(req.user.role, current, status, ownsDossier)) {
      return res.status(403).json({ error: `Transition ${current} → ${status} non autorisée pour ce rôle` });
    }

    await db.execute({
      sql: "UPDATE dossiers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?",
      args: [status, id, req.tenantId],
    });

    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, 'STATUS_CHANGED', 'dossier', id, { from: current, to: status }, req);
    res.json({ ok: true, id, status });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/decide', authMiddleware, tenantGuard, requireRole('COMITE', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { decision, amount, duration, schedule, motif } = req.body;

    if (!decision || !motif) {
      return res.status(400).json({ error: 'Décision et motif requis' });
    }
    if (!['approved', 'refused', 'complement', 'modified'].includes(decision)) {
      return res.status(400).json({ error: 'Décision invalide' });
    }

    const existing = await db.execute({
      sql: 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?',
      args: [id, req.tenantId],
    });
    if (!existing.rows[0]) return res.status(404).json({ error: 'Dossier introuvable' });

    const dossier = existing.rows[0];
    if (!['committee_ready', 'committee'].includes(dossier.status)) {
      return res.status(409).json({ error: 'Le dossier doit être transmis au comité avant la décision finale' });
    }
    const isOverride = dossier.prequalification &&
      ((decision === 'approved' && dossier.prequalification === 'NON_ELIGIBLE') ||
       (decision === 'refused' && dossier.prequalification === 'PREQUALIFIE') ||
       (amount && amount !== dossier.amount_requested));

    const nextStatus = decision === 'complement' ? 'incomplete' : 'decided';
    await db.execute({
      sql: `UPDATE dossiers SET
            decision = ?, decision_amount = ?, decision_duration = ?,
            decision_schedule = ?, decision_motif = ?,
            decided_by = ?, decided_at = CURRENT_TIMESTAMP,
            status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND tenant_id = ?`,
      args: [decision, amount || null, duration || null, schedule || null, motif,
        req.user.id, nextStatus, id, req.tenantId],
    });

    const auditAction = isOverride ? 'DECISION_OVERRIDE' : 'DECISION_MADE';
    await logAudit(req.tenantId, req.user.id, req.user.name, req.user.role, auditAction, 'dossier', id, {
      decision, amount, duration, motif,
      prequalification: dossier.prequalification,
      override: isOverride,
    }, req);

    res.json({ ok: true, id, decision, status: nextStatus, override: isOverride });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
