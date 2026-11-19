import test from 'tape';
import crypto from 'crypto';
import { hashSecret, verifySecret } from './secret-hash.js';
import { encryptField } from './encryption.js';

const KEY = 'test-field-encryption-key-at-least-32-chars';

test('hashSecret — salted: same secret produces different hashes', (t) => {
  const a = hashSecret('s3cret');
  const b = hashSecret('s3cret');
  t.notEqual(a, b, 'hashes differ per call');
  t.ok(a.startsWith('scrypt$'), 'uses scrypt scheme prefix');
  t.notOk(a.includes('s3cret'), 'plaintext is not embedded');
  t.end();
});

test('verifySecret — accepts the right secret and rejects the wrong one', (t) => {
  const stored = hashSecret('s3cret');
  t.ok(verifySecret('s3cret', stored), 'correct secret verifies');
  t.notOk(verifySecret('wrong', stored), 'wrong secret rejected');
  t.end();
});

test('verifySecret — unwraps encryptField-protected hashes', (t) => {
  const stored = encryptField(hashSecret('s3cret'), KEY);
  t.ok(verifySecret('s3cret', stored, KEY), 'encrypted hash verifies');
  t.notOk(verifySecret('wrong', stored, KEY), 'wrong secret rejected');
  t.notOk(verifySecret('s3cret', stored, 'another-key-that-is-at-least-32-chars!'), 'wrong key rejected');
  t.end();
});

test('verifySecret — still accepts legacy unsalted SHA-256 digests', (t) => {
  const legacy = crypto.createHash('sha256').update('s3cret').digest('hex');
  t.ok(verifySecret('s3cret', legacy), 'legacy digest verifies');
  t.notOk(verifySecret('wrong', legacy), 'legacy digest rejects wrong secret');
  t.end();
});

test('verifySecret — malformed stored values are rejected', (t) => {
  for (const bad of ['', 'scrypt$zz$zz', 'bcrypt$00$00', 'scrypt$00', 'not-a-hash']) {
    t.notOk(verifySecret('s3cret', bad), `rejects ${JSON.stringify(bad)}`);
  }
  t.end();
});
