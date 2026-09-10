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

export async function hasBicConsent(db, dossierId, tenantId) {
  const result = await db.execute({
    sql: `SELECT id, consent_given FROM consent_records
          WHERE dossier_id = ? AND tenant_id = ? AND consent_type = 'bic_check'
          ORDER BY created_at DESC, id DESC LIMIT 1`,
    args: [dossierId, tenantId],
  });
  return Boolean(result.rows[0]?.consent_given);
}

export function scoreInvalidationStatement(dossierId, tenantId) {
  return {
    sql: `UPDATE dossiers SET evidence_confidence = NULL, repayment_capacity = NULL,
          prequalification = NULL, prequalification_reasons = '[]',
          prequalification_score = NULL, prequalification_score_details = '{}',
          prequalification_score_version = NULL, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?`,
    args: [dossierId, tenantId],
  };
}
