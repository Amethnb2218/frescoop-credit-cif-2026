import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDetailedRepaymentSchedule,
  calculateLoanTerms,
  normalizeScheduleType,
} from './creditCalculations.js';

test('calcule les intérêts simples et le total dû', () => {
  const terms = calculateLoanTerms({
    amount_requested: 100000,
    duration_months: 12,
    interest_rate: 20,
    desired_schedule: 'Mensuel',
  });
  assert.equal(terms.interest_amount, 20000);
  assert.equal(terms.total_repayable, 120000);
});

test('accepte un montant d’intérêts saisi explicitement', () => {
  const terms = calculateLoanTerms({
    amount_requested: 100000,
    duration_months: 6,
    interest_calculation_mode: 'fixed',
    interest_amount: 20000,
  });
  assert.equal(terms.interest_amount, 20000);
  assert.equal(terms.total_repayable, 120000);
});

test('normalise les six échéanciers demandés et le saisonnier', () => {
  assert.equal(normalizeScheduleType('Mensuel classique'), 'MONTHLY');
  assert.equal(normalizeScheduleType('Trimestriel'), 'QUARTERLY');
  assert.equal(normalizeScheduleType('Semestriel'), 'SEMIANNUAL');
  assert.equal(normalizeScheduleType('Annuel'), 'ANNUAL');
  assert.equal(normalizeScheduleType('In fine'), 'BULLET');
  assert.equal(normalizeScheduleType('Dégressif'), 'DECLINING');
  assert.equal(normalizeScheduleType('Saisonnier (post-récolte)'), 'SEASONAL');
});

test('répartit le total dû selon la périodicité', () => {
  const quarterly = buildDetailedRepaymentSchedule({
    amount_requested: 100000,
    duration_months: 12,
    interest_calculation_mode: 'fixed',
    interest_amount: 20000,
    desired_schedule: 'Trimestriel',
  });
  assert.deepEqual(quarterly.installments.filter(item => item.payment > 0).map(item => item.month), [3, 6, 9, 12]);
  assert.equal(quarterly.installments.reduce((sum, item) => sum + item.payment, 0), 120000);

  const semiannual = buildDetailedRepaymentSchedule({
    amount_requested: 120000, duration_months: 12, interest_rate: 10,
    desired_schedule: 'Semestriel',
  });
  assert.deepEqual(semiannual.installments.filter(item => item.payment > 0).map(item => item.month), [6, 12]);

  const annual = buildDetailedRepaymentSchedule({
    amount_requested: 120000, duration_months: 18, interest_rate: 10,
    desired_schedule: 'Annuel',
  });
  assert.deepEqual(annual.installments.filter(item => item.payment > 0).map(item => item.month), [12, 18]);

  const bullet = buildDetailedRepaymentSchedule({
    amount_requested: 100000, duration_months: 12, interest_rate: 20,
    desired_schedule: 'In fine',
  });
  assert.deepEqual(bullet.installments.filter(item => item.payment > 0).map(item => item.month), [12]);
  assert.equal(bullet.installments[11].payment, 120000);
});

test('le dégressif amortit le principal et réduit les intérêts', () => {
  const schedule = buildDetailedRepaymentSchedule({
    amount_requested: 120000,
    duration_months: 12,
    interest_rate: 12,
    desired_schedule: 'Dégressif',
  });
  assert.equal(schedule.installments[0].principal, 10000);
  assert.equal(schedule.installments[0].interest, 1200);
  assert.equal(schedule.installments[11].interest, 100);
  assert.equal(schedule.installments[11].remaining_principal, 0);
  assert.equal(schedule.terms.interest_amount, 7800);
  assert.equal(schedule.terms.total_repayable, 127800);
});
