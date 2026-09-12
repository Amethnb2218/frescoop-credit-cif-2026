import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEligibleSectors, severityPresentation } from './catalogDisplay.js';

test('formate les secteurs éligibles sans exposer le JSON', () => {
  assert.equal(formatEligibleSectors(['Agriculture', 'Élevage']), 'Agriculture, Élevage');
  assert.equal(formatEligibleSectors('["Agriculture","Élevage"]'), 'Agriculture, Élevage');
  assert.equal(formatEligibleSectors('Commerce'), 'Commerce');
  assert.equal(formatEligibleSectors(''), '—');
  assert.equal(formatEligibleSectors(null), '—');
});

test('traduit les sévérités métier et conserve leur tonalité', () => {
  assert.deepEqual(severityPresentation('critical'), { label: 'Critique', tone: 'danger' });
  assert.deepEqual(severityPresentation('high'), { label: 'Élevée', tone: 'warning' });
  assert.deepEqual(severityPresentation('medium'), { label: 'Moyenne', tone: 'neutral' });
  assert.deepEqual(severityPresentation('low'), { label: 'Faible', tone: 'neutral' });
});
