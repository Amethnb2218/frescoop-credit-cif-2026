export const DECISION_AUTHORITY_THRESHOLD = 1_000_000;

const DECISION_STATUSES_BY_AUTHORITY = Object.freeze({
  SUPERVISEUR: new Set(['review', 'review_required', 'prequalified', 'committee_ready', 'committee']),
  COMITE: new Set(['committee_ready', 'committee']),
});

export function resolveDecisionAuthority(amountRequested) {
  if (amountRequested === null || amountRequested === undefined || amountRequested === '') return null;
  const normalizedAmount = Number(amountRequested);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return null;
  return normalizedAmount <= DECISION_AUTHORITY_THRESHOLD ? 'SUPERVISEUR' : 'COMITE';
}

export function canExerciseDecisionAuthority(role, authority) {
  if (!DECISION_STATUSES_BY_AUTHORITY[authority]) return false;
  return role === authority || role === 'ADMIN' || role === 'SUPERADMIN';
}

export function isDecisionStatusAllowed(status, authority) {
  return DECISION_STATUSES_BY_AUTHORITY[authority]?.has(status) || false;
}

export async function findAccessibleDossier(db, dossierId, req) {
  let sql = 'SELECT * FROM dossiers WHERE id = ? AND tenant_id = ?';
  const args = [dossierId, req.tenantId];
  if (req.user.role === 'AGENT') {
    sql += ' AND agent_id = ?';
    args.push(req.user.id);
  }
  const result = await db.execute({ sql, args });
  return result.rows[0] || null;
}

export function isEditableDraft(dossier) {
  return Boolean(dossier && ['draft', 'incomplete'].includes(dossier.status));
}

export function isSyncEditableDossier(dossier) {
  return isEditableDraft(dossier);
}

export function scoreInvalidationStatement(dossierId, tenantId) {
  return {
    sql: "UPDATE dossiers SET updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
    args: [dossierId, tenantId],
  };
}

export function activeDecisionResetStatement(dossierId, tenantId) {
  return {
    sql: `UPDATE dossiers SET decision = NULL, decision_amount = NULL, decision_duration = NULL,
          decision_schedule = NULL, decision_motif = NULL, decided_by = NULL, decided_at = NULL,
          updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`,
    args: [dossierId, tenantId],
  };
}

export async function hasBicConsent(db, dossierId, tenantId) {
  const result = await db.execute({
    sql: `SELECT id, consent_given FROM consent_records
          WHERE dossier_id = ? AND tenant_id = ? AND consent_type = 'bic_check'
          ORDER BY created_at DESC, id DESC LIMIT 1`,
    args: [dossierId, tenantId],
  });
  return Boolean(result.rows[0]?.consent_given);
}