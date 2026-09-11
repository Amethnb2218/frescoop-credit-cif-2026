function finite(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value) {
  return Math.max(0, Math.round(finite(value)));
}

export function normalizeScheduleType(value = '') {
  const rawSchedule = String(value).trim().toUpperCase();
  if (['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'BULLET', 'DECLINING', 'SEASONAL'].includes(rawSchedule)) {
    return rawSchedule;
  }
  const schedule = String(value).toLowerCase();
  if (schedule.includes('saisonnier')) return 'SEASONAL';
  if (schedule.includes('in fine') || schedule.includes('bullet')) return 'BULLET';
  if (schedule.includes('dégressif') || schedule.includes('degressif') || schedule.includes('declining')) return 'DECLINING';
  if (schedule.includes('semestriel') || schedule.includes('semiannual')) return 'SEMIANNUAL';
  if (schedule.includes('trimestriel') || schedule.includes('quarterly')) return 'QUARTERLY';
  if (schedule.includes('annuel') || schedule.includes('annual')) return 'ANNUAL';
  return 'MONTHLY';
}

function paymentIndexes(scheduleType, durationMonths, cashflow) {
  const last = durationMonths - 1;
  if (scheduleType === 'BULLET') return [last];
  if (scheduleType === 'SEASONAL') {
    const indexes = cashflow.slice(0, durationMonths)
      .map((entry, index) => ({ index, revenue: finite(entry?.revenue) }))
      .filter(item => item.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3)
      .map(item => item.index)
      .sort((a, b) => a - b);
    return indexes.length ? indexes : [last];
  }
  const interval = scheduleType === 'QUARTERLY' ? 3
    : scheduleType === 'SEMIANNUAL' ? 6
      : scheduleType === 'ANNUAL' ? 12 : 1;
  const indexes = [];
  for (let index = interval - 1; index < durationMonths; index += interval) indexes.push(index);
  if (!indexes.includes(last)) indexes.push(last);
  return indexes;
}

function allocate(total, count) {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  let remainder = total - base * count;
  return Array.from({ length: count }, () => base + (remainder-- > 0 ? 1 : 0));
}

function decliningInterest(principal, durationMonths, annualRate, fixedInterest, mode) {
  const principalParts = allocate(principal, durationMonths);
  const outstandingWeights = principalParts.map((_, index) => durationMonths - index);
  if (mode === 'fixed' && fixedInterest != null) {
    const totalWeight = outstandingWeights.reduce((sum, value) => sum + value, 0);
    const raw = outstandingWeights.map(weight => fixedInterest * weight / totalWeight);
    const rounded = raw.map(Math.floor);
    let remainder = fixedInterest - rounded.reduce((sum, value) => sum + value, 0);
    for (let index = 0; remainder > 0; index = (index + 1) % rounded.length) {
      rounded[index] += 1;
      remainder -= 1;
    }
    return { principalParts, interestParts: rounded };
  }
  let outstanding = principal;
  const monthlyRate = Math.max(0, annualRate) / 1200;
  const interestParts = principalParts.map(part => {
    const interest = Math.round(outstanding * monthlyRate);
    outstanding -= part;
    return interest;
  });
  return { principalParts, interestParts };
}

export function calculateLoanTerms(input = {}) {
  const principal = money(input.amount_requested ?? input.amountRequested);
  const duration = Math.max(0, Math.trunc(finite(input.duration_months ?? input.durationMonths)));
  const annualRate = Math.max(0, finite(input.interest_rate ?? input.interestRate));
  const mode = input.interest_calculation_mode === 'fixed' ? 'fixed' : 'rate';
  const fixed = input.interest_amount === '' || input.interest_amount == null
    ? null : money(input.interest_amount);
  const scheduleType = normalizeScheduleType(input.schedule_type ?? input.desired_schedule ?? input.scheduleType);
  let interest = mode === 'fixed' && fixed != null
    ? fixed
    : money(principal * annualRate / 100 * (duration / 12));
  if (scheduleType === 'DECLINING' && principal > 0 && duration > 0) {
    const parts = decliningInterest(principal, duration, annualRate, fixed, mode);
    interest = parts.interestParts.reduce((sum, value) => sum + value, 0);
  }
  return {
    principal,
    duration_months: duration,
    interest_rate: annualRate,
    interest_calculation_mode: mode,
    interest_amount: interest,
    total_repayable: principal + interest,
    schedule_type: scheduleType,
  };
}

export function buildDetailedRepaymentSchedule(input = {}, cashflow = []) {
  const terms = calculateLoanTerms(input);
  const duration = terms.duration_months;
  if (terms.principal <= 0 || duration <= 0) return { terms, installments: [] };
  const installments = Array.from({ length: duration }, (_, index) => ({
    month: index + 1, principal: 0, interest: 0, payment: 0,
    remaining_principal: terms.principal,
  }));
  if (terms.schedule_type === 'DECLINING') {
    const fixed = terms.interest_calculation_mode === 'fixed' ? terms.interest_amount : null;
    const parts = decliningInterest(terms.principal, duration, terms.interest_rate, fixed, terms.interest_calculation_mode);
    let remaining = terms.principal;
    installments.forEach((item, index) => {
      item.principal = parts.principalParts[index];
      item.interest = parts.interestParts[index];
      item.payment = item.principal + item.interest;
      remaining -= item.principal;
      item.remaining_principal = Math.max(0, remaining);
    });
    return { terms: { ...terms, interest_amount: parts.interestParts.reduce((s, v) => s + v, 0), total_repayable: installments.reduce((s, v) => s + v.payment, 0) }, installments };
  }
  const indexes = paymentIndexes(terms.schedule_type, duration, cashflow);
  const principals = allocate(terms.principal, indexes.length);
  const interests = allocate(terms.interest_amount, indexes.length);
  let remaining = terms.principal;
  indexes.forEach((monthIndex, index) => {
    const item = installments[monthIndex];
    item.principal = principals[index];
    item.interest = interests[index];
    item.payment = item.principal + item.interest;
  });
  installments.forEach(item => {
    remaining -= item.principal;
    item.remaining_principal = Math.max(0, remaining);
  });
  return { terms, installments };
}
