import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeAttachment } from './evidence.js';

const PDF = Buffer.from('%PDF-1.4\nsynthetic-test');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

function payload(mime_type, content) {
  return { mime_type, content_base64: content.toString('base64') };
}

test('accepte les signatures PDF, PNG et JPEG valides', () => {
  assert.equal(decodeAttachment(payload('application/pdf', PDF)).content.length, PDF.length);
  assert.equal(decodeAttachment(payload('image/png', PNG)).content.length, PNG.length);
  assert.equal(decodeAttachment(payload('image/jpeg', JPEG)).content.length, JPEG.length);
});

test('refuse un MIME non autorisé et un contenu vide', () => {
  assert.throws(() => decodeAttachment(payload('text/plain', Buffer.from('test'))), /Type de fichier invalide/);
  assert.throws(() => decodeAttachment({ mime_type: 'application/pdf', content_base64: '' }), /Contenu du fichier requis/);
});

test('refuse les signatures trompeuses', () => {
  assert.throws(() => decodeAttachment(payload('application/pdf', PNG)), /ne correspond pas/);
  assert.throws(() => decodeAttachment(payload('image/png', PDF)), /ne correspond pas/);
  assert.throws(() => decodeAttachment(payload('image/jpeg', PNG)), /ne correspond pas/);
});

test('refuse un fichier dépassant deux mégaoctets', () => {
  const oversizedPdf = Buffer.alloc((2 * 1024 * 1024) + 1);
  PDF.copy(oversizedPdf);
  assert.throws(() => decodeAttachment(payload('application/pdf', oversizedPdf)), /taille maximale de 2 Mo/);
});
