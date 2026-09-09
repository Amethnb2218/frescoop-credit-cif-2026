export const AGRICULTURAL_RULES_VERSION = 1;

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeItems(items = []) {
  return items.map(item => ({
    ...item,
    quantity: Math.max(0, number(item.quantity)),
    unit_cost: Math.max(0, number(item.unit_cost)),
  }));
}

export function assessAgriculturalProject(project = {}, inputItems = [], evidence = []) {
  const items = normalizeItems(inputItems);
  const budgetTotal = items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  const ownContribution = Math.max(0, number(project.own_contribution));
  const otherFunding = Math.max(0, number(project.other_funding));
  const financingGap = Math.max(0, budgetTotal - ownContribution - otherFunding);
  const surface = Math.max(0, number(project.project_surface_ha));
  const expectedYield = Math.max(0, number(project.expected_yield));
  const expectedPrice = Math.max(0, number(project.expected_price));
  const lossPercent = Math.min(100, Math.max(0, number(project.loss_percent)));
  const grossProduction = surface * expectedYield;
  const saleableProduction = grossProduction * (1 - lossPercent / 100);
  const expectedRevenue = saleableProduction * expectedPrice;
  const grossMargin = expectedRevenue - budgetTotal;
  const campaignRoi = budgetTotal > 0 ? grossMargin / budgetTotal : null;
  const findings = [];
  const missing = [];

  for (const [field, label] of [
    ['crop_label', 'culture'], ['project_surface_ha', 'surface du projet'],
    ['agro_zone', 'zone agroécologique'], ['soil_type', 'type de sol'],
    ['season', 'saison'], ['cultivation_mode', 'mode de culture'],
  ]) {
    if (!project[field]) missing.push(label);
  }

  const irrigated = ['irrigue', 'irrigué', 'mixte'].includes(String(project.cultivation_mode || '').toLowerCase());
  if (irrigated && !project.water_source) {
    findings.push({ code: 'WATER_REQUIRED', severity: 'high', field: 'water_source', explanation: 'Une source d’eau doit être documentée pour une culture irriguée.', action: 'Documenter la source et la disponibilité de l’eau.' });
  }
  if (budgetTotal <= 0) {
    findings.push({ code: 'BUDGET_MISSING', severity: 'medium', field: 'input_items', explanation: 'Le budget du projet agricole est absent.', action: 'Ajouter les intrants et leurs coûts.' });
  }
  if (budgetTotal > 0 && grossMargin < 0) {
    findings.push({ code: 'NEGATIVE_MARGIN', severity: 'high', field: 'expected_revenue', explanation: 'Le revenu prudent ne couvre pas le budget de campagne.', action: 'Réviser le rendement, le prix, les coûts ou le montant demandé.' });
  }
  if (surface > 0 && number(project.previous_surface_ha) > 0 && surface > number(project.previous_surface_ha) * 1.5) {
    findings.push({ code: 'SURFACE_GROWTH', severity: 'medium', field: 'project_surface_ha', explanation: 'La surface projetée dépasse fortement la surface déjà cultivée.', action: 'Justifier les moyens techniques et humains nécessaires.' });
  }
  if (number(project.amount_requested) > financingGap * 1.05 && financingGap > 0) {
    findings.push({ code: 'AMOUNT_ABOVE_NEED', severity: 'medium', field: 'amount_requested', explanation: 'Le montant demandé dépasse le besoin net calculé de plus de 5 %.', action: 'Justifier ou réduire le montant demandé.' });
  }

  const verifiedEvidence = evidence.filter(item => ['A', 'B'].includes(item.verification_level)).length;
  const documentedEvidence = evidence.filter(item => ['A', 'B', 'C'].includes(item.verification_level)).length;
  const confidenceLevel = verifiedEvidence >= 2 ? 'HIGH' : documentedEvidence >= 2 ? 'MEDIUM' : 'LOW';
  let adequacyStatus = 'ADEQUATE';
  if (missing.length) adequacyStatus = 'INSUFFICIENT_DATA';
  else if (findings.some(item => item.code === 'WATER_REQUIRED')) adequacyStatus = 'INCOMPATIBLE';
  else if (findings.length) adequacyStatus = 'ATTENTION';
  const viabilityStatus = budgetTotal <= 0 ? 'INSUFFICIENT_DATA' : grossMargin < 0 ? 'NON_VIABLE' : campaignRoi < 0.15 ? 'FRAGILE' : 'VIABLE';

  let orientation = 'CONTINUER_VERS_CASHFLOW';
  if (adequacyStatus === 'INCOMPATIBLE' || viabilityStatus === 'NON_VIABLE') orientation = 'REVUE_HUMAINE';
  else if (missing.length || confidenceLevel === 'LOW') orientation = 'COLLECTER_PREUVES';
  else if (findings.some(item => item.code === 'AMOUNT_ABOVE_NEED' || item.code === 'BUDGET_MISSING')) orientation = 'AJUSTER_BUDGET';

  return {
    rules_version: AGRICULTURAL_RULES_VERSION,
    adequacy_status: adequacyStatus,
    viability_status: viabilityStatus,
    confidence_level: confidenceLevel,
    orientation,
    missing_data: missing,
    findings,
    metrics: {
      budget_total: Math.round(budgetTotal), financing_gap: Math.round(financingGap),
      gross_production: grossProduction, saleable_production: saleableProduction,
      expected_revenue: Math.round(expectedRevenue), gross_margin: Math.round(grossMargin),
      campaign_roi: campaignRoi == null ? null : Number(campaignRoi.toFixed(4)),
    },
  };
}
