import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dossierDraftKey,
  restoreDraftEvidence,
  serializeDraftEvidence,
} from './dossierDraft.js';

test('isole le brouillon de création par utilisateur', () => {
  assert.equal(dossierDraftKey('agent-1'), 'new-dossier:agent-1');
  assert.equal(dossierDraftKey(), 'new-dossier:anonymous');
});

test('remplace le fichier par ses métadonnées sérialisables', () => {
  const evidence = serializeDraftEvidence([{
    id: 'preuve-1',
    label: 'Facture semences',
    file: { name: 'facture.pdf', type: 'application/pdf', size: 2048 },
  }]);

  assert.equal('file' in evidence[0], false);
  assert.deepEqual(evidence[0].metadata, {
    file_name: 'facture.pdf',
    file_type: 'application/pdf',
    file_size: 2048,
    upload_pending: true,
  });
  assert.equal(evidence[0].file_reselection_required, true);
});

test('signale la resélection lors de la restauration', () => {
  const [evidence] = restoreDraftEvidence([{
    id: 'preuve-1',
    metadata: { file_name: 'facture.pdf', upload_pending: true },
  }]);

  assert.equal(evidence.file, null);
  assert.equal(evidence.file_reselection_required, true);
});
