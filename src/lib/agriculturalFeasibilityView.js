function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function deterministicNarrative(analysis = {}) {
  const report = analysis.report || analysis.details?.report;
  if (typeof report === 'string') return text(report);
  return text(report?.narrative);
}

export function terangaNarrative(analysis = {}) {
  return text(analysis.report?.teranga_narrative)
    || text(analysis.details?.report?.teranga_narrative)
    || text(analysis.source?.teranga?.message);
}

export function terangaMetadata(analysis = {}) {
  const source = analysis.source || {};
  const teranga = source.teranga || {};
  return {
    source: text(teranga.source) || null,
    model: text(teranga.model) || null,
    notice: text(teranga.notice) || null,
    degraded: Boolean(teranga.degraded || source.mode === 'hybrid_partial'),
    partial: source.mode === 'hybrid_partial',
    attempted: Boolean(teranga.attempted),
    available: Boolean(teranga.available),
  };
}

export function feasibilityReportView(analysis = {}) {
  const details = analysis.details || {};
  return {
    deterministicNarrative: deterministicNarrative(analysis),
    terangaNarrative: terangaNarrative(analysis),
    teranga: terangaMetadata(analysis),
    metrics: details.metrics || analysis.calculated_metrics || {},
    signals: Array.isArray(details.external_signals) ? details.external_signals : [],
    missingData: Array.isArray(details.missing_data) ? details.missing_data : [],
    findings: Array.isArray(details.findings) ? details.findings : [],
    recommendations: Array.isArray(details.recommendations) ? details.recommendations : [],
  };
}
