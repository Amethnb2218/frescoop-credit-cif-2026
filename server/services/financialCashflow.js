export const REVENUE_FREQUENCIES = ['hebdomadaire', 'mensuel', 'trimestriel', 'saisonnier'];

const ANNUAL_MULTIPLIERS = {
  hebdomadaire: 52,
  mensuel: 12,
  trimestriel: 4,
  saisonnier: 1,
};

function nonNegative(value, field) {
  if (value === '' || value == null || value === 'neant') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} doit être un nombre positif ou nul`);
  return parsed;
}

export function annualizeRevenue(value, frequency, field = 'revenu') {
  const normalized = frequency || 'mensuel';
  if (!REVENUE_FREQUENCIES.includes(normalized)) {
    throw new Error(`Fréquence invalide pour ${field}: ${normalized}`);
  }
  return nonNegative(value, field) * ANNUAL_MULTIPLIERS[normalized];
}

function revenueAdjustment(declared, retained) {
  const declaredValue = Number(declared);
  const retainedValue = Number(retained);
  return Number.isFinite(declaredValue) && Number.isFinite(retainedValue)
    ? retainedValue - declaredValue
    : null;
}

function agriculturalRevenue(projectAssessment) {
  const metrics = projectAssessment.calculated_metrics || projectAssessment.details?.metrics || {};
  if (projectAssessment.retained_revenue != null) return {
    value: projectAssessment.retained_revenue,
    source: 'retained_revenue',
    declared: projectAssessment.declared_revenue ?? metrics.declared_revenue,
    retained: projectAssessment.retained_revenue,
    adjustment: projectAssessment.revenue_adjustment ?? metrics.revenue_adjustment
      ?? revenueAdjustment(projectAssessment.declared_revenue ?? metrics.declared_revenue, projectAssessment.retained_revenue),
  };
  if (metrics.retained_revenue != null) return {
    value: metrics.retained_revenue,
    source: 'retained_revenue',
    declared: projectAssessment.declared_revenue ?? metrics.declared_revenue,
    retained: metrics.retained_revenue,
    adjustment: projectAssessment.revenue_adjustment ?? metrics.revenue_adjustment
      ?? revenueAdjustment(projectAssessment.declared_revenue ?? metrics.declared_revenue, metrics.retained_revenue),
  };
  const legacy = projectAssessment.expected_revenue ?? metrics.expected_revenue;
  return { value: legacy, source: 'project_assessment', declared: null, retained: null, adjustment: null };
}

export function buildFinancialCashflow(financialSummary = {}, projectAssessment = {}, declaredDebts = [], year = 2026) {
  const commerceFrequency = financialSummary.commerce_revenue_frequency || 'mensuel';
  const otherFrequency = financialSummary.other_revenue_frequency || 'mensuel';
  const annualCommerce = annualizeRevenue(financialSummary.commerce_revenue, commerceFrequency, 'revenu commerce');
  const annualOther = annualizeRevenue(financialSummary.other_revenue, otherFrequency, 'autres revenus');
  const agricultureRevenue = agriculturalRevenue(projectAssessment);
  const annualAgriculture = nonNegative(agricultureRevenue.value, 'revenu agricole attendu');
  const agriculturalExpenses = nonNegative(financialSummary.agricultural_expenses, 'charges agricoles');
  const householdExpenses = nonNegative(financialSummary.household_expenses, 'charges du ménage')
    + nonNegative(financialSummary.other_expenses, 'anciennes autres charges');
  const monthlyExpenses = agriculturalExpenses + householdExpenses;
  const monthlyDebt = declaredDebts.reduce(
    (sum, debt) => sum + nonNegative(debt.periodic_payment ?? debt.monthly_payment, 'échéance dette'),
    0,
  );
  if (annualAgriculture === 0 && annualCommerce === 0 && annualOther === 0 && monthlyExpenses === 0 && monthlyDebt === 0) return [];

  const harvestMonth = Math.min(12, Math.max(1, nonNegative(projectAssessment.harvest_month, 'mois de récolte') || 12));
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const commerce = commerceFrequency === 'saisonnier'
      ? (month === harvestMonth ? annualCommerce : 0)
      : Math.round(annualCommerce / 12);
    const other = otherFrequency === 'saisonnier'
      ? (month === harvestMonth ? annualOther : 0)
      : Math.round(annualOther / 12);
    const agriculture = month === harvestMonth ? Math.round(annualAgriculture) : 0;
    return {
      month,
      year: Number(year) || 2026,
      revenue: agriculture + commerce + other,
      revenue_detail: {
        agriculture,
        commerce,
        other,
        commerce_frequency: commerceFrequency,
        other_frequency: otherFrequency,
        agriculture_source: agricultureRevenue.source,
        agriculture_audit: {
          declared_revenue: agricultureRevenue.declared,
          retained_revenue: agricultureRevenue.retained,
          revenue_adjustment: agricultureRevenue.adjustment,
        },
        financial_inputs: {
          commerce_revenue: nonNegative(financialSummary.commerce_revenue, 'revenu commerce'),
          commerce_revenue_frequency: commerceFrequency,
          other_revenue: nonNegative(financialSummary.other_revenue, 'autres revenus'),
          other_revenue_frequency: otherFrequency,
          agricultural_expenses: agriculturalExpenses,
          household_expenses: nonNegative(financialSummary.household_expenses, 'charges du ménage'),
          other_expenses: nonNegative(financialSummary.other_expenses, 'anciennes autres charges'),
        },
        derived: true,
      },
      expenses: Math.round(monthlyExpenses),
      expenses_detail: {
        agriculture: agriculturalExpenses,
        household: householdExpenses,
        legacy_other_merged: nonNegative(financialSummary.other_expenses, 'anciennes autres charges'),
        derived: true,
      },
      debt_payments: Math.round(monthlyDebt),
    };
  });
}
