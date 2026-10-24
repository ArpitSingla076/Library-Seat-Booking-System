/**
 * Strips MongoDB operator injection ("$gt", "a.b" keys) from req.body / req.query / req.params
 * and trims overly long strings. Replacement for express-mongo-sanitize (no extra dependency).
 */
const MAX_STRING = 2000;

const clean = (obj) => {
  if (Array.isArray(obj)) return obj.map(clean);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = clean(v);
    }
    return out;
  }
  if (typeof obj === 'string' && obj.length > MAX_STRING) return obj.slice(0, MAX_STRING);
  return obj;
};

const sanitize = (req, _res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.query) {
    const q = clean(req.query);
    Object.keys(req.query).forEach((k) => delete req.query[k]);
    Object.assign(req.query, q);
  }
  if (req.params) req.params = clean(req.params);
  next();
};

module.exports = { sanitize };
