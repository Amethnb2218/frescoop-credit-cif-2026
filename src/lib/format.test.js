import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMissingScoreData,
  isProvisionalScore,
  isScoreAvailable,
  normalizeMissingData,
  parseScoreDetails,
} from './format.js';

test('parse les détails de score valides sans lever d’erreur', () => {
  assert.deepEqual(parseScoreDetails('{"missing_data":[]}'), { missing_data: [] });
  assert.deepEqual(parseScoreDetails({ version: 4 }), { version: 4 });
  assert.equal(parseScoreDetails('{invalide'), null);
});

test('normalise et déduplique les données manquantes du serveur', () => {
  assert.deepEqual(normalizeMissingData([
    { code: 'CROP_REQUIRED', field: 'crop', label: 'Culture' },
    { code: 'CROP_REQUIRED', field: 'crop', label: 'Culture dupliquée' },
    ' Localité ',
    { field: 'month', label: '' },
    null,
  ]), [
    { code: 'CROP_REQUIRED', field: 'crop', label: 'Culture' },
    { code: null, field: null, label: 'Localité' },
    { code: null, field: 'month', label: 'month' },
  ]);
});

test('lit missing_data et utilise un repli vide pour les anciens dossiers', () => {
  assert.deepEqual(getMissingScoreData({ missing_data: ['Culture'] }), [
    { code: null, field: null, label: 'Culture' },
  ]);
  assert.deepEqual(getMissingScoreData(null), []);
  assert.deepEqual(getMissingScoreData('{invalide'), []);
});

test('reconnaît le statut explicite ou implicite d’un score provisoire', () => {
  assert.equal(isProvisionalScore({ provisional: true }), true);
  assert.equal(isProvisionalScore('{"status":"INSUFFICIENT_DATA"}'), true);
  assert.equal(isProvisionalScore({ provisional: false, status: 'COMPLETE' }), false);
  assert.equal(isProvisionalScore('{invalide'), false);
});

test('distingue un score zéro d’un score absent ou invalide', () => {
  assert.equal(isScoreAvailable(0), true);
  assert.equal(isScoreAvailable('0'), true);
  assert.equal(isScoreAvailable(null), false);
  assert.equal(isScoreAvailable(undefined), false);
  assert.equal(isScoreAvailable(''), false);
  assert.equal(isScoreAvailable('   '), false);
  assert.equal(isScoreAvailable('invalide'), false);
});
