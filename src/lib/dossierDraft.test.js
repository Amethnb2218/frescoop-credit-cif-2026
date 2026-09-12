import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOSSIER_DRAFT_VERSION,
  createDossierDraft,
  dossierDraftKey,
  parseDossierDraft,
  restoreDraftEvidence,
  serializeDraftEvidence,
} from './dossierDraft.js';

test('isole les brouillons de création et d’édition par utilisateur', () => {
  assert.equal(dossierDraftKey('agent-1'), 'new-dossier:agent-1');
  assert.equal(dossierDraftKey(), 'new-dossier:anonymous');
  assert.equal(dossierDraftKey('agent-1', 'dossier-2'), 'edit-dossier:agent-1:dossier-2');
});

test('remplace le fichier par ses métadonnées sérialisables', () => {
  const evidence = serializeDraftEvidence([{
    id: 'preuve-1', label: 'Facture semences',
    file: { name: 'facture.pdf', type: 'application/pdf', size: 2048 },
  }]);
  assert.equal('file' in evidence[0], false);
  assert.deepEqual(evidence[0].metadata, {
    file_name: 'facture.pdf', file_type: 'application/pdf', file_size: 2048, upload_pending: true,
  });
  assert.equal(evidence[0].file_reselection_required, true);
});

test('signale la resélection lors de la restauration', () => {
  const [evidence] = restoreDraftEvidence([{
    id: 'preuve-1', metadata: { file_name: 'facture.pdf', upload_pending: true },
  }]);
  assert.equal(evidence.file, null);
  assert.equal(evidence.file_reselection_required, true);
});

test('construit et restaure un brouillon complet versionné', () => {
  const savedAt = new Date('2026-09-12T10:15:00.000Z');
  const payload = createDossierDraft({
    form: { applicant_name: 'Awa' }, step: 4,
    inputItems: [{ label: 'Semences' }], declaredDebts: [{ institution: 'IMF' }],
    initialEvidence: [{ id: 'p1' }],
    feasibilityAnalysis: { result: { status: 'FEASIBLE' }, updatedAt: savedAt }, savedAt,
  });
  assert.equal(payload.version, DOSSIER_DRAFT_VERSION);
  const restored = parseDossierDraft(JSON.stringify(payload));
  assert.equal(restored.step, 4);
  assert.equal(restored.form.applicant_name, 'Awa');
  assert.equal(restored.inputItems.length, 1);
  assert.equal(restored.declaredDebts.length, 1);
  assert.equal(restored.feasibilityAnalysis.result.status, 'FEASIBLE');
  assert.ok(restored.savedAt instanceof Date);
  assert.ok(restored.feasibilityAnalysis.updatedAt instanceof Date);
});

test('rejette un JSON corrompu ou une version obsolète et borne l’étape', () => {
  assert.equal(parseDossierDraft('{cassé'), null);
  assert.equal(parseDossierDraft({ version: 0, form: {}, savedAt: new Date().toISOString() }), null);
  const payload = createDossierDraft({ form: {}, step: 99 });
  assert.equal(parseDossierDraft(payload).step, 6);
});
