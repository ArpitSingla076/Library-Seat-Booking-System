const test = require('node:test');
const assert = require('node:assert');
const { totp, base32Encode, base32Decode, generateSecret, verifyTotp } = require('../utils/totp');

test('TOTP matches RFC 6238 test vector (SHA1, T=59s -> 94287082)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.strictEqual(totp(secret, 59 * 1000, 8), '94287082');
  assert.strictEqual(totp(secret, 1111111109 * 1000, 8), '07081804');
});

test('base32 round trip and verify', () => {
  const s = generateSecret();
  assert.strictEqual(base32Encode(base32Decode(s)), s);
  assert.strictEqual(verifyTotp(s, totp(s)), true);
  assert.strictEqual(verifyTotp(s, '000000') || verifyTotp(s, '123456') ? 'maybe' : 'no', 'no');
});
