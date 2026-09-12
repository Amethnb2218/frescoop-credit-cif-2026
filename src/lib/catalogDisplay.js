const SEVERITY_LABELS = {
  critical: 'Critique',
  high: 'Élevée',
  medium: 'Moyenne',
  low: 'Faible',
};

export function formatEligibleSectors(value) {
  if (Array.isArray(value)) {
    const sectors = value.map(item => String(item || '').trim()).filter(Boolean);
    return sectors.length ? sectors.join(', ') : '—';
  }
  if (typeof value !== 'string') return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return formatEligibleSectors(parsed);
  } catch {
    // Une chaîne métier simple est déjà un libellé affichable.
  }
  return trimmed;
}

export function severityPresentation(value) {
  const severity = String(value || '').trim().toLowerCase();
  return {
    label: SEVERITY_LABELS[severity] || (severity ? String(value) : 'Non précisée'),
    tone: severity === 'critical' ? 'danger'
      : severity === 'high' ? 'warning'
        : 'neutral',
  };
}
