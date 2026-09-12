import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deterministicNarrative,
  feasibilityReportView,
  terangaMetadata,
  terangaNarrative,
} from './agriculturalFeasibilityView.js';

test('sélectionne la narration Teranga depuis le rapport principal', () => {
  assert.equal(terangaNarrative({ report: { teranga_narrative: 'Conseil principal.' } }), 'Conseil principal.');
});

test('sélectionne la narration Teranga depuis le rapport détaillé', () => {
  assert.equal(terangaNarrative({ details: { report: { teranga_narrative: 'Conseil détaillé.' } } }), 'Conseil détaillé.');
});

test('utilise le message source comme dernier repli réel', () => {
  assert.equal(terangaNarrative({ source: { teranga: { message: 'Conseil source.' } } }), 'Conseil source.');
  assert.equal(terangaNarrative({}), '');
});

test('sépare narration déterministe, signaux et métadonnées Teranga', () => {
  const analysis = {
    report: { narrative: 'Analyse FresCoop.' },
    details: { external_signals: [{ type: 'yield' }], metrics: { retained_yield: 3200 } },
    source: { mode: 'hybrid_partial', teranga: {
      source: 'groq', model: 'openai/gpt-oss-120b', notice: 'Données partielles', available: true,
    } },
  };
  assert.equal(deterministicNarrative(analysis), 'Analyse FresCoop.');
  assert.deepEqual(terangaMetadata(analysis), {
    source: 'groq', model: 'openai/gpt-oss-120b', notice: 'Données partielles',
    degraded: true, partial: true, attempted: false, available: true,
  });
  const view = feasibilityReportView(analysis);
  assert.equal(view.metrics.retained_yield, 3200);
  assert.equal(view.signals.length, 1);
});
