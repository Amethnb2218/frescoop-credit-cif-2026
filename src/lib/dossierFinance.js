function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function calculateProjectBudget(items = [], form = {}) {
  const byCategory = items.reduce((totals, item) => {
    const category = item.category || 'Autres';
    totals[category] = (totals[category] || 0)
      + amount(item.quantity) * amount(item.unit_cost);
    return totals;
  }, {});
  const total = Object.values(byCategory).reduce((sum, value) => sum + value, 0);
  const ownContribution = amount(form.own_contribution);
  const otherFunding = amount(form.other_funding);
  const realNeed = Math.max(0, total - ownContribution - otherFunding);
  const requested = amount(form.amount_requested);
  return {
    byCategory,
    total,
    ownContribution,
    otherFunding,
    realNeed,
    requested,
    overfinancing: Math.max(0, requested - realNeed),
    advisedAmount: Math.min(requested, realNeed),
  };
}
