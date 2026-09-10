import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CROP_OPTIONS,
  OTHER_CROP_VALUE,
  cropSelectionFromProject,
  resolveCrop,
} from './agriculturalProject.js';

test('résout une culture prédéfinie en code et libellé stables', () => {
  assert.ok(CROP_OPTIONS.some(item => item.code === 'TOMATO'));
  assert.deepEqual(resolveCrop('TOMATO'), { crop_code: 'TOMATO', crop_label: 'Tomate' });
});

test('résout Autre sans transmettre le code littéral OTHER', () => {
  assert.deepEqual(resolveCrop(OTHER_CROP_VALUE, '  Bissap rouge  '), {
    crop_code: 'CUSTOM_BISSAP_ROUGE',
    crop_label: 'Bissap rouge',
  });
  assert.deepEqual(resolveCrop(OTHER_CROP_VALUE, '  '), { crop_code: null, crop_label: null });
});

test('restaure une culture personnalisée dans le choix Autre', () => {
  assert.deepEqual(cropSelectionFromProject({ crop_code: 'CUSTOM_BISSAP', crop_label: 'Bissap' }), {
    selection: OTHER_CROP_VALUE,
    otherLabel: 'Bissap',
  });
});

test('restaure une culture prédéfinie sans champ libre', () => {
  assert.deepEqual(cropSelectionFromProject({ crop_code: 'MAIZE', crop_label: 'Maïs' }), {
    selection: 'MAIZE',
    otherLabel: '',
  });
});
