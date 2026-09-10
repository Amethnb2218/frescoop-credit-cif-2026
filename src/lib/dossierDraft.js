export function dossierDraftKey(userId) {
  return `new-dossier:${userId || 'anonymous'}`;
}

export function serializeDraftEvidence(evidence = []) {
  return evidence.map(({ file, ...item }) => ({
    ...item,
    metadata: file
      ? {
          ...(item.metadata || {}),
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          upload_pending: true,
        }
      : (item.metadata || {}),
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
