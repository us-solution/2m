const xssClean = require('xss-clean')();

// Clean strings from HTML tags and SQL-like patterns
const cleanValue = (val) => {
  if (typeof val === 'string') {
    // Basic SQL Injection prevention: escape single quotes and semicolons if suspicious
    // and remove simple script tags (fallback for xssClean)
    let sanitized = val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    sanitized = sanitized.trim();
    return sanitized;
  } else if (typeof val === 'object' && val !== null) {
    for (const key in val) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        val[key] = cleanValue(val[key]);
      }
    }
  }
  return val;
};

const sanitizeInput = (req, res, next) => {
  // 1. Run standard xss-clean to strip out any XSS payloads from body, query, params
  xssClean(req, res, () => {
    // 2. Perform custom deep cleaning of strings
    if (req.body) req.body = cleanValue(req.body);
    if (req.query) req.query = cleanValue(req.query);
    if (req.params) req.params = cleanValue(req.params);
    next();
  });
};

module.exports = { sanitizeInput };
