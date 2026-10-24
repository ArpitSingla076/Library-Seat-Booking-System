const crypto = require('crypto');

/** Minimal RFC 6238 TOTP (Google Authenticator compatible), no dependencies. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buf) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

const base32Decode = (str) => {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

const generateSecret = () => base32Encode(crypto.randomBytes(20));

const hotp = (secretBuf, counter, digits = 6) => {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
};

const totp = (secret, timeMs = Date.now(), digits = 6) => hotp(base32Decode(secret), Math.floor(timeMs / 30000), digits);

const verifyTotp = (secret, code, window = 1) => {
  if (!/^\d{6}$/.test(String(code || ''))) return false;
  const counter = Math.floor(Date.now() / 30000);
  const key = base32Decode(secret);
  for (let i = -window; i <= window; i += 1) {
    if (hotp(key, counter + i) === String(code)) return true;
  }
  return false;
};

const otpauthUrl = (label, secret, issuer = 'BookMySeat') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;

module.exports = { generateSecret, totp, verifyTotp, otpauthUrl, base32Encode, base32Decode };
