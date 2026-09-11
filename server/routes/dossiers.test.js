import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionDossierStatus,
  normalizeGuarantors,
  validateDossierFields,
  validateFinancialFields,
  validateGuarantors,
} from './dossiers.js';
import {
  canExerciseDecisionAuthority,
  isDecisionStatusAllowed,
  resolveDecisionAuthority,
} from '../services/dossierAccess.js';

const validDossier = {
  applicant_id_number: ' sn-2024-78432 ',
  sector: 'Agriculture',
  activity_type: 'Grandes cultures',
};

test('valide une CNI synthétique et le périmètre agricole', () => {
  assert.equal(validateDossierFields(validDossier), null);
  assert.match(validateDossierFields({ ...validDossier, applicant_id_number: '  ' }), /CNI/);
  assert.match(validateDossierFields({ ...validDossier, sector: 'Commerce' }), /Agriculture/);
  assert.match(validateDossierFields({ ...validDossier, activity_type: 'Aviculture' }), /invalide/);
  assert.match(validateDossierFields({ ...validDossier, activity_type: 'Riziculture' }), /invalide/);
});

test('valide les montants, intérêts, durées et calendriers financiers', () => {
  const valid = {
    amount_requested: 500000,
    duration_months: 12,
    desired_schedule: 'DECLINING',
    interest_rate: 12,
    interest_amount: 39000,
    total_repayable: 539000,
  };
  assert.equal(validateFinancialFields(valid), null);
  assert.match(validateFinancialFields({ ...valid, amount_requested: -1 }), /positif/);
  assert.match(validateFinancialFields({ ...valid, duration_months: 1.5 }), /entier/);
  assert.match(validateFinancialFields({ ...valid, interest_rate: 101 }), /valide/);
  assert.match(validateFinancialFields({ ...valid, desired_schedule: 'chaotique' }), /Calendrier/);
  assert.match(validateFinancialFields({ ...valid, total_repayable: 500000 }), /principal/);
});
test('préserve les champs historiques non modifiés lors d’une mise à jour', () => {
  assert.equal(validateDossierFields({ applicant_phone: '+221770000000' }, true), null);
});

test('exige un garant structuré pour tout engagement de tiers', () => {
  const data = {
    guarantee_type: 'Caution personnelle',
    guarantors: [{
      full_name: 'Moussa Fall', cni: 'SN-2024-00001', phone: '+221770000001',
      address: 'Thiès', relationship: 'Frère', nature: 'Caution personnelle',
      limit: 300000, consent: true,
    }],
  };
  const guarantors = normalizeGuarantors(data);
  assert.equal(validateGuarantors(data, guarantors), null);
  assert.equal(guarantors[0].id_number, 'SN-2024-00001');
  assert.equal(guarantors[0].commitment_amount, 300000);
  assert.match(validateGuarantors(data, []), /garant/i);
  assert.match(validateGuarantors(data, [{ ...guarantors[0], consent_given: false }]), /consentement/i);
});

test('applique la matrice de décision aux bornes et aux administrateurs', () => {
  const cases = [
    [999999, 'SUPERVISEUR'],
    [1000000, 'SUPERVISEUR'],
    [1000001, 'COMITE'],
  ];
  for (const [amountRequested, authority] of cases) {
    assert.equal(resolveDecisionAuthority(amountRequested), authority);
  }
  assert.equal(canExerciseDecisionAuthority('SUPERVISEUR', resolveDecisionAuthority(1000000)), true);
  assert.equal(canExerciseDecisionAuthority('SUPERVISEUR', resolveDecisionAuthority(1000001)), false);
  assert.equal(canExerciseDecisionAuthority('COMITE', resolveDecisionAuthority(1000001)), true);
  assert.equal(canExerciseDecisionAuthority('ADMIN', resolveDecisionAuthority(1000001)), true);
  assert.equal(canExerciseDecisionAuthority('SUPERADMIN', resolveDecisionAuthority(1000000)), true);
  assert.equal(isDecisionStatusAllowed('review', resolveDecisionAuthority(1000000)), true);
  assert.equal(isDecisionStatusAllowed('review', resolveDecisionAuthority(1000001)), false);
  assert.equal(isDecisionStatusAllowed('committee_ready', resolveDecisionAuthority(1000001)), true);
});

test('limite les transitions de statut des agents à leurs propres brouillons', () => {
  assert.equal(canTransitionDossierStatus('AGENT', 'draft', 'submitted', true), true);
  assert.equal(canTransitionDossierStatus('AGENT', 'incomplete', 'draft', true), true);
  assert.equal(canTransitionDossierStatus('AGENT', 'draft', 'submitted', false), false);
  assert.equal(canTransitionDossierStatus('AGENT', 'submitted', 'verification', true), false);
});

test('réserve le workflow de revue aux rôles habilités', () => {
  assert.equal(canTransitionDossierStatus('SUPERVISEUR', 'submitted', 'verification'), true);
  assert.equal(canTransitionDossierStatus('RISK_MANAGER', 'verification', 'review'), true);
  assert.equal(canTransitionDossierStatus('COMITE', 'review', 'committee'), false);
  assert.equal(canTransitionDossierStatus('AUDITEUR', 'submitted', 'verification'), false);
  assert.equal(canTransitionDossierStatus('ADMIN', 'exported', 'disbursed'), true);
});

test('impose la route de décision humaine pour atteindre le statut décidé', () => {
  assert.equal(canTransitionDossierStatus('SUPERADMIN', 'committee', 'decided'), false);
  assert.equal(canTransitionDossierStatus('ADMIN', 'committee_ready', 'decided'), false);
  assert.equal(canTransitionDossierStatus('ADMIN', 'draft', 'closed'), false);
});
