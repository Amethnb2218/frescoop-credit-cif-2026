export const AGRICULTURAL_RULES_VERSION = 2;

const REQUIRED_PROJECT_FIELDS = [
  { code: 'CROP_REQUIRED', field: 'crop_label', label: 'culture' },
  { code: 'SURFACE_REQUIRED', field: 'project_surface_ha', label: 'surface du projet' },
  { code: 'AGRO_ZONE_REQUIRED', field: 'agro_zone', label: 'zone agroécologique' },
  { code: 'SOIL_TYPE_REQUIRED', field: 'soil_type', label: 'type de sol' },
  { code: 'SEASON_REQUIRED', field: 'season', label: 'saison' },
  { code: 'CULTIVATION_MODE_REQUIRED', field: 'cultivation_mode', label: 'mode de culture' },
  { code: 'YIELD_REQUIRED', field: 'expected_yield', label: 'rendement attendu' },
  { code: 'PRICE_REQUIRED', field: 'expected_price', label: 'prix de vente' },
  { code: 'LOSS_PERCENT_REQUIRED', field: 'loss_percent', label: 'pertes estimées' },
];

function finiteNumber(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeOrNull(value) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function positiveOrNull(value) {
  const parsed = finiteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function roundOrNull(value) {
  return value == null ? null : Math.round(value);
}

function normalizeItems(items = []) {
  return items.map(item => ({
    ...item,
    quantity: nonNegativeOrNull(item.quantity),
    unit_cost: nonNegativeOrNull(item.unit_cost),
  }));
}

export function calculateAgriculturalMetrics(project = {}, inputItems = []) {
  const items = normalizeItems(inputItems);
  const positiveCostItems = items.filter(item => item.quantity != null && item.unit_cost != null
    && item.quantity * item.unit_cost > 0);
  const budgetTotal = positiveCostItems.length > 0
    ? positiveCostItems.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0)
    : null;
  const ownContribution = nonNegativeOrNull(project.own_contribution) ?? 0;
  const otherFunding = nonNegativeOrNull(project.other_funding) ?? 0;
  const financingGap = budgetTotal == null ? null : Math.max(0, budgetTotal - ownContribution - otherFunding);
  const surface = positiveOrNull(project.project_surface_ha);
  const expectedYield = positiveOrNull(project.expected_yield);
  const expectedPrice = nonNegativeOrNull(project.expected_price);
  const rawLossPercent = nonNegativeOrNull(project.loss_percent);
  const lossPercent = rawLossPercent != null && rawLossPercent <= 100 ? rawLossPercent : null;
  const grossProduction = surface != null && expectedYield != null ? surface * expectedYield : null;
  const saleableProduction = grossProduction != null && lossPercent != null
    ? grossProduction * (1 - lossPercent / 100)
    : null;
  const expectedRevenue = saleableProduction != null && expectedPrice != null
    ? saleableProduction * expectedPrice
    : null;
  const grossMargin = expectedRevenue != null && budgetTotal != null
    ? expectedRevenue - budgetTotal
    : null;
  const campaignRoi = grossMargin != null && budgetTotal > 0 ? grossMargin / budgetTotal : null;

  return {
    budget_total: roundOrNull(budgetTotal),
    financing_gap: roundOrNull(financingGap),
    gross_production: grossProduction,
    saleable_production: saleableProduction,
    expected_revenue: roundOrNull(expectedRevenue),
    gross_margin: roundOrNull(grossMargin),
    campaign_roi: campaignRoi == null ? null : Number(campaignRoi.toFixed(4)),
  };
}

export function listMissingAgriculturalData(project = {}, inputItems = []) {
  const missing = [];
  for (const item of REQUIRED_PROJECT_FIELDS) {
    const value = project[item.field];
    const absent = ['project_surface_ha', 'expected_yield'].includes(item.field)
      ? positiveOrNull(value) == null
      : ['expected_price'].includes(item.field)
        ? nonNegativeOrNull(value) == null
        : item.field === 'loss_percent'
          ? nonNegativeOrNull(value) == null || Number(value) > 100
          : !String(value || '').trim();
    if (absent) missing.push(item);
  }
  const items = Array.isArray(inputItems) ? inputItems : [];
  if (items.length === 0) {
    missing.push({ code: 'INPUT_REQUIRED', field: 'input_items', label: 'intrants du projet' });
  } else if (!items.some(item => {
    const quantity = nonNegativeOrNull(item.quantity);
    const unitCost = nonNegativeOrNull(item.unit_cost);
    return quantity != null && unitCost != null && quantity * unitCost > 0;
  })) {
    missing.push({ code: 'POSITIVE_INPUT_COST_REQUIRED', field: 'input_items.unit_cost', label: 'coût positif d’un intrant' });
  }
  return missing;
}

export function assessAgriculturalProject(project = {}, inputItems = [], evidence = []) {
  const metrics = calculateAgriculturalMetrics(project, inputItems);
  const missing = listMissingAgriculturalData(project, inputItems);
  const findings = [];
  const irrigated = ['irrigue', 'irrigué', 'mixte'].includes(String(project.cultivation_mode || '').toLowerCase());

  if (irrigated && !project.water_source) {
    findings.push({ code: 'WATER_REQUIRED', severity: 'high', field: 'water_source', explanation: 'Une source d’eau doit être documentée pour une culture irriguée.', action: 'Documenter la source et la disponibilité de l’eau.' });
  }
  if (metrics.budget_total == null) {
    findings.push({ code: 'BUDGET_MISSING', severity: 'medium', field: 'input_items', explanation: 'Le budget du projet agricole est absent ou sans coût positif.', action: 'Ajouter les intrants et leurs coûts.' });
  }
  if (metrics.gross_margin != null && metrics.gross_margin < 0) {
    findings.push({ code: 'NEGATIVE_MARGIN', severity: 'high', field: 'expected_revenue', explanation: 'Le revenu prudent ne couvre pas le budget de campagne.', action: 'Réviser le rendement, le prix, les coûts ou le montant demandé.' });
  }
  const surface = positiveOrNull(project.project_surface_ha);
  const previousSurface = positiveOrNull(project.previous_surface_ha);
  if (surface != null && previousSurface != null && surface > previousSurface * 1.5) {
    findings.push({ code: 'SURFACE_GROWTH', severity: 'medium', field: 'project_surface_ha', explanation: 'La surface projetée dépasse fortement la surface déjà cultivée.', action: 'Justifier les moyens techniques et humains nécessaires.' });
  }
  const amountRequested = positiveOrNull(project.amount_requested);
  if (amountRequested != null && metrics.financing_gap > 0 && amountRequested > metrics.financing_gap * 1.05) {
    findings.push({ code: 'AMOUNT_ABOVE_NEED', severity: 'medium', field: 'amount_requested', explanation: 'Le montant demandé dépasse le besoin net calculé de plus de 5 %.', action: 'Justifier ou réduire le montant demandé.' });
  }

  const verifiedEvidence = evidence.filter(item => ['A', 'B'].includes(item.verification_level)).length;
  const documentedEvidence = evidence.filter(item => ['A', 'B', 'C'].includes(item.verification_level)).length;
  const confidenceLevel = verifiedEvidence >= 2 ? 'HIGH' : documentedEvidence >= 2 ? 'MEDIUM' : 'LOW';
  let adequacyStatus = 'ADEQUATE';
  if (missing.length) adequacyStatus = 'INSUFFICIENT_DATA';
  else if (findings.some(item => item.code === 'WATER_REQUIRED')) adequacyStatus = 'INCOMPATIBLE';
  else if (findings.length) adequacyStatus = 'ATTENTION';
  const viabilityStatus = metrics.budget_total == null || metrics.gross_margin == null
    ? 'INSUFFICIENT_DATA'
    : metrics.gross_margin < 0 ? 'NON_VIABLE'
      : metrics.campaign_roi < 0.15 ? 'FRAGILE' : 'VIABLE';

  let orientation = 'CONTINUER_VERS_CASHFLOW';
  if (adequacyStatus === 'INCOMPATIBLE' || viabilityStatus === 'NON_VIABLE') orientation = 'REVUE_HUMAINE';
  else if (missing.length || confidenceLevel === 'LOW') orientation = 'COLLECTER_PREUVES';
  else if (findings.some(item => ['AMOUNT_ABOVE_NEED', 'BUDGET_MISSING'].includes(item.code))) orientation = 'AJUSTER_BUDGET';

  return {
    rules_version: AGRICULTURAL_RULES_VERSION,
    adequacy_status: adequacyStatus,
    viability_status: viabilityStatus,
    confidence_level: confidenceLevel,
    orientation,
    missing_data: missing,
    findings,
    metrics,
  };
}
