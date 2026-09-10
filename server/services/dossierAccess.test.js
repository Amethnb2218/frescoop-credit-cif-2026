import test from 'node:test';
import assert from 'node:assert/strict';
import { findAccessibleDossier, hasBicConsent, isEditableDraft } from './dossierAccess.js';

function fakeDb(row) {
  return {
    lastQuery: null,
    async execute(query) {
      this.lastQuery = query;
      return { rows: row ? [row] : [] };
    },
  };
}

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
