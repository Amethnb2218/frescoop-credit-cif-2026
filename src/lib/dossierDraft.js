export const DOSSIER_DRAFT_VERSION = 1;

export function dossierDraftKey(userId, dossierId) {
  const owner = userId || 'anonymous';
  return dossierId ? `edit-dossier:${owner}:${dossierId}` : `new-dossier:${owner}`;
}

export function serializeDraftEvidence(evidence = []) {
  return evidence.map(({ file, ...item }) => ({
    ...item,
    metadata: file ? {
      ...(item.metadata || {}),
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      upload_pending: true,
    } : (item.metadata || {}),
    file_reselection_required: Boolean(file || item.file_reselection_required),
  }));
}

export function restoreDraftEvidence(evidence = []) {
  return evidence.map(item => ({
    ...item,
    file: null,
    file_reselection_required: Boolean(
      item.file_reselection_required
      || (item.metadata?.file_name && item.metadata?.upload_pending),
    ),
  }));
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createDossierDraft({
  form = {}, step = 0, inputItems = [], declaredDebts = [], initialEvidence = [],
  feasibilityAnalysis = null, savedAt = new Date(),
} = {}) {
  return {
    version: DOSSIER_DRAFT_VERSION,
    savedAt: (validDate(savedAt) || new Date()).toISOString(),
    step: Math.max(0, Math.trunc(Number(step) || 0)),
    form,
    inputItems,
    declaredDebts,
    initialEvidence: serializeDraftEvidence(initialEvidence),
    feasibilityAnalysis: feasibilityAnalysis ? {
      ...feasibilityAnalysis,
      updatedAt: validDate(feasibilityAnalysis.updatedAt)?.toISOString() || null,
    } : null,
  };
}

export function parseDossierDraft(value, maxStep = 6) {
  let draft = value;
  try { if (typeof value === 'string') draft = JSON.parse(value); } catch { return null; }
  if (!draft || typeof draft !== 'object' || draft.version !== DOSSIER_DRAFT_VERSION) return null;
  const savedAt = validDate(draft.savedAt);
  if (!savedAt || !draft.form || typeof draft.form !== 'object') return null;
  const feasibilityAnalysis = draft.feasibilityAnalysis ? {
    ...draft.feasibilityAnalysis,
    updatedAt: validDate(draft.feasibilityAnalysis.updatedAt),
  } : null;
  return {
    ...draft,
    savedAt,
    step: Math.min(Math.max(0, Math.trunc(Number(draft.step) || 0)), maxStep),
    inputItems: Array.isArray(draft.inputItems) ? draft.inputItems : [],
    declaredDebts: Array.isArray(draft.declaredDebts) ? draft.declaredDebts : [],
    initialEvidence: restoreDraftEvidence(Array.isArray(draft.initialEvidence) ? draft.initialEvidence : []),
    feasibilityAnalysis,
  };
}
