import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionDossierStatus,
  normalizeGuarantors,
  validateDossierFields,
  validateGuarantors,
} from './dossiers.js';

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
