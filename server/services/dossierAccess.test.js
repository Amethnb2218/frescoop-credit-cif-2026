import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeDecisionResetStatement,
  canExerciseDecisionAuthority,
  findAccessibleDossier,
  hasBicConsent,
  isDecisionStatusAllowed,
  isEditableDraft,
  isSyncEditableDossier,
  resolveDecisionAuthority,
  scoreInvalidationStatement,
} from './dossierAccess.js';

function fakeDb(row) {
  return {
    lastQuery: null,
    async execute(query) {
      this.lastQuery = query;
      return { rows: row ? [row] : [] };
    },
  };
}

test('résout l’autorité métier aux bornes du seuil', () => {
  assert.equal(resolveDecisionAuthority(999999), 'SUPERVISEUR');
  assert.equal(resolveDecisionAuthority(1000000), 'SUPERVISEUR');
  assert.equal(resolveDecisionAuthority(1000001), 'COMITE');
  assert.equal(resolveDecisionAuthority('1000000'), 'SUPERVISEUR');
  assert.equal(resolveDecisionAuthority(null), null);
  assert.equal(resolveDecisionAuthority('montant-invalide'), null);
});

test('autorise uniquement le rôle métier requis ou un administrateur', () => {
  assert.equal(canExerciseDecisionAuthority('SUPERVISEUR', 'SUPERVISEUR'), true);
  assert.equal(canExerciseDecisionAuthority('SUPERVISEUR', 'COMITE'), false);
  assert.equal(canExerciseDecisionAuthority('COMITE', 'COMITE'), true);
  assert.equal(canExerciseDecisionAuthority('COMITE', 'SUPERVISEUR'), false);
  assert.equal(canExerciseDecisionAuthority('ADMIN', 'SUPERVISEUR'), true);
  assert.equal(canExerciseDecisionAuthority('ADMIN', 'COMITE'), true);
  assert.equal(canExerciseDecisionAuthority('SUPERADMIN', 'COMITE'), true);
  assert.equal(canExerciseDecisionAuthority('AGENT', 'SUPERVISEUR'), false);
});

test('adapte les statuts préalables à l’autorité métier', () => {
  for (const status of ['review', 'review_required', 'prequalified', 'committee_ready', 'committee']) {
    assert.equal(isDecisionStatusAllowed(status, 'SUPERVISEUR'), true, status);
  }
  assert.equal(isDecisionStatusAllowed('review', 'COMITE'), false);
  assert.equal(isDecisionStatusAllowed('prequalified', 'COMITE'), false);
  assert.equal(isDecisionStatusAllowed('committee_ready', 'COMITE'), true);
  assert.equal(isDecisionStatusAllowed('committee', 'COMITE'), true);
});

test('filtre la propriété pour un Agent', async () => {
  const db = fakeDb({ id: 'dossier-1', status: 'draft' });
  const dossier = await findAccessibleDossier(db, 'dossier-1', {
    tenantId: 'tenant-a',
    user: { id: 'agent-a', role: 'AGENT' },
  });
  assert.equal(dossier.id, 'dossier-1');
  assert.match(db.lastQuery.sql, /tenant_id = \?/);
  assert.match(db.lastQuery.sql, /agent_id = \?/);
  assert.deepEqual(db.lastQuery.args, ['dossier-1', 'tenant-a', 'agent-a']);
});

test('conserve le filtre tenant sans propriété pour un superviseur', async () => {
  const db = fakeDb({ id: 'dossier-1', status: 'submitted' });
  await findAccessibleDossier(db, 'dossier-1', {
    tenantId: 'tenant-a',
    user: { id: 'supervisor-a', role: 'SUPERVISEUR' },
  });
  assert.match(db.lastQuery.sql, /tenant_id = \?/);
  assert.doesNotMatch(db.lastQuery.sql, /agent_id = \?/);
  assert.deepEqual(db.lastQuery.args, ['dossier-1', 'tenant-a']);
});

test('limite les mutations métier aux brouillons', () => {
  assert.equal(isEditableDraft({ status: 'draft' }), true);
  assert.equal(isEditableDraft({ status: 'incomplete' }), true);
  assert.equal(isEditableDraft({ status: 'submitted' }), false);
  assert.equal(isEditableDraft(null), false);
});

test('limite explicitement les mises à jour sync à draft et incomplete', () => {
  assert.equal(isSyncEditableDossier({ status: 'draft' }), true);
  assert.equal(isSyncEditableDossier({ status: 'incomplete' }), true);
  assert.equal(isSyncEditableDossier({ status: 'submitted' }), false);
});

test('ne remet jamais le score à null pendant une mutation', () => {
  const statement = scoreInvalidationStatement('dossier-1', 'tenant-a');
  assert.doesNotMatch(statement.sql, /prequalification_score\s*=\s*NULL/i);
  assert.deepEqual(statement.args, ['dossier-1', 'tenant-a']);
});

test('réinitialise seulement la décision active lors d’une resoumission', () => {
  const statement = activeDecisionResetStatement('dossier-1', 'tenant-a');
  assert.match(statement.sql, /decision = NULL/);
  assert.doesNotMatch(statement.sql, /DELETE/i);
});
